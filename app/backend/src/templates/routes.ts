import type { FastifyPluginAsync } from 'fastify';
import { Readable } from 'node:stream';
import path from 'node:path';
import { validateTemplateDraft, type Template, type TemplateDto } from './types.js';
import { z } from 'zod';
import { templateRepository } from './repository.js';
import { templateStorage } from './storage.js';
import { mediaValidator } from '../services/media-validator.js';
import { zip, type ZipEntry } from './zip.js';
import { parseZip, parseManifest, assetExtension } from './import.js';

const errorResponse = (
  reply: { status: (code: number) => { send: (body: unknown) => unknown } },
  code: string,
  message: string,
  status = 400,
) => reply.status(status).send({ success: false, error: { code, message } });

export function toTemplateDto(template: Template): TemplateDto {
  return {
    ...template,
    backgroundPath: template.backgroundPath ? `/templates/${template.id}/background` : null,
    overlays: template.overlays.map((overlay) => ({
      ...overlay,
      path: overlay.path ? `/templates/${template.id}/overlays/${overlay.id}` : null,
    })),
  };
}

function imageExtension(format: string): 'png' | 'jpg' | 'svg' {
  return format === 'jpeg' ? 'jpg' : (format as 'png' | 'svg');
}

export const templateRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/templates', async (_request, reply) =>
    reply.send({ success: true, data: (await templateRepository.list()).map(toTemplateDto) }),
  );

  fastify.patch<{ Body: { orderedIds?: string[] } }>('/templates/order', async (request, reply) => {
    const parsed = z.array(z.string().uuid()).safeParse(request.body?.orderedIds);
    if (!parsed.success || parsed.data.length === 0)
      return errorResponse(reply, 'INVALID_ORDER', 'A non-empty list of template ids is required');
    try {
      const templates = await templateRepository.reorder(parsed.data);
      return reply.send({ success: true, data: templates.map(toTemplateDto) });
    } catch (error: unknown) {
      return errorResponse(
        reply,
        'DATABASE_ERROR',
        error instanceof Error ? error.message : String(error),
        500,
      );
    }
  });

  fastify.get('/templates/export', async (_request, reply) => {
    const templates = await templateRepository.list();
    const assetName = (templateId: string, kind: string, assetPath: string) =>
      `assets/${templateId}/${kind}${path.extname(assetPath).toLowerCase()}`;
    const manifest = {
      version: 1,
      templates: templates.map((template) => ({
        ...template,
        backgroundPath: template.backgroundPath
          ? assetName(template.id, 'background', template.backgroundPath)
          : null,
        overlays: template.overlays.map((overlay) => ({
          ...overlay,
          path: overlay.path ? assetName(template.id, `overlay-${overlay.id}`, overlay.path) : null,
        })),
      })),
    };
    async function* entries(): AsyncGenerator<ZipEntry> {
      yield { name: 'manifest.json', content: Buffer.from(JSON.stringify(manifest, null, 2)) };
      for (const template of templates) {
        if (template.backgroundPath)
          yield {
            name: assetName(template.id, 'background', template.backgroundPath),
            content: await templateStorage.readAsset(template.id, template.backgroundPath),
          };
        for (const overlay of template.overlays) {
          if (overlay.path)
            yield {
              name: assetName(template.id, `overlay-${overlay.id}`, overlay.path),
              content: await templateStorage.readAsset(template.id, overlay.path),
            };
        }
      }
    }
    return reply
      .header('Content-Disposition', 'attachment; filename="photobooth-templates.zip"')
      .type('application/zip')
      .send(Readable.from(zip(entries())));
  });

  fastify.post('/templates/import', async (request, reply) => {
    let file;
    try {
      file = await request.file();
    } catch {
      return errorResponse(reply, 'INVALID_ARCHIVE', 'A template archive file is required');
    }
    if (!file) return errorResponse(reply, 'INVALID_ARCHIVE', 'A template archive file is required');
    try {
      const entries = parseZip(await file.toBuffer());
      const pkg = parseManifest(entries);
      const existingNames = new Set((await templateRepository.list()).map((t) => t.name));
      const seenNames = new Set<string>();
      for (const entry of pkg.templates) {
        if (seenNames.has(entry.template.name) || existingNames.has(entry.template.name))
          return errorResponse(
            reply,
            'TEMPLATE_NAME_EXISTS',
            `A template named “${entry.template.name}” already exists or is duplicated in the archive`,
            409,
          );
        seenNames.add(entry.template.name);
      }
      const imported = [];
      for (const entry of pkg.templates) {
        const template = await templateRepository.create(entry.template);
        if (entry.backgroundPath) {
          const assetPath = await templateStorage.saveAsset(
            template.id,
            'background',
            assetExtension(entry.backgroundPath),
            entries.get(entry.backgroundPath)!,
          );
          const updated = await templateRepository.setBackgroundPath(template.id, assetPath);
          if (updated) Object.assign(template, updated);
        }
        for (const overlay of entry.overlays) {
          if (overlay.id && overlay.path && entries.has(overlay.path)) {
            const assetPath = await templateStorage.saveAsset(
              template.id,
              'overlay',
              assetExtension(overlay.path),
              entries.get(overlay.path)!,
            );
            const updated = await templateRepository.addOverlayPath(template.id, overlay.id, assetPath);
            if (updated) Object.assign(template, updated);
          }
        }
        imported.push(template);
      }
      return reply.status(201).send({ success: true, data: imported.map(toTemplateDto) });
    } catch (error: unknown) {
      return errorResponse(
        reply,
        'IMPORT_FAILED',
        error instanceof Error ? error.message : String(error),
        400,
      );
    }
  });

  fastify.get<{ Params: { id: string } }>('/templates/:id', async (request, reply) => {
    const template = await templateRepository.get(request.params.id);
    return template
      ? reply.send({ success: true, data: toTemplateDto(template) })
      : errorResponse(reply, 'TEMPLATE_NOT_FOUND', 'Template does not exist', 404);
  });

  fastify.post('/templates', async (request, reply) => {
    try {
      const template = await templateRepository.create(validateTemplateDraft(request.body));
      return reply.status(201).send({ success: true, data: toTemplateDto(template) });
    } catch (error: unknown) {
      if ((error as { code?: string }).code === '23505')
        return errorResponse(
          reply,
          'TEMPLATE_NAME_EXISTS',
          'A template with this name already exists',
          409,
        );
      if (error instanceof Error && error.name === 'ZodError')
        return errorResponse(reply, 'INVALID_TEMPLATE', error.message);
      return errorResponse(
        reply,
        'DATABASE_ERROR',
        error instanceof Error ? error.message : String(error),
        500,
      );
    }
  });

  fastify.put<{ Params: { id: string } }>('/templates/:id', async (request, reply) => {
    try {
      const previous = await templateRepository.get(request.params.id);
      const template = await templateRepository.update(
        request.params.id,
        validateTemplateDraft(request.body),
      );
      if (template && previous) {
        const retainedPaths = new Set(
          template.overlays.map((overlay) => overlay.path).filter(Boolean),
        );
        for (const overlay of previous.overlays) {
          if (overlay.path && !retainedPaths.has(overlay.path))
            await templateStorage.removeAsset(overlay.path);
        }
      }
      return template
        ? reply.send({ success: true, data: toTemplateDto(template) })
        : errorResponse(reply, 'TEMPLATE_NOT_FOUND', 'Template does not exist', 404);
    } catch (error: unknown) {
      if ((error as { code?: string }).code === '23505')
        return errorResponse(
          reply,
          'TEMPLATE_NAME_EXISTS',
          'A template with this name already exists',
          409,
        );
      if (error instanceof Error && error.name === 'ZodError')
        return errorResponse(reply, 'INVALID_TEMPLATE', error.message);
      return errorResponse(
        reply,
        'DATABASE_ERROR',
        error instanceof Error ? error.message : String(error),
        500,
      );
    }
  });

  fastify.patch<{ Params: { id: string }; Body: { active?: boolean } }>(
    '/templates/:id/active',
    async (request, reply) => {
      if (typeof request.body?.active !== 'boolean')
        return errorResponse(reply, 'INVALID_ACTIVE_STATE', 'active must be a boolean');
      const template = await templateRepository.setActive(request.params.id, request.body.active);
      return template
        ? reply.send({ success: true, data: toTemplateDto(template) })
        : errorResponse(reply, 'TEMPLATE_NOT_FOUND', 'Template does not exist', 404);
    },
  );

  fastify.delete<{ Params: { id: string } }>('/templates/:id', async (request, reply) => {
    const template = await templateRepository.delete(request.params.id);
    if (!template)
      return errorResponse(reply, 'TEMPLATE_NOT_FOUND', 'Template does not exist', 404);
    await templateStorage.removeTemplate(template.id);
    return reply.status(204).send();
  });

  fastify.post<{ Params: { id: string } }>('/templates/:id/background', async (request, reply) => {
    const template = await templateRepository.get(request.params.id);
    if (!template)
      return errorResponse(reply, 'TEMPLATE_NOT_FOUND', 'Template does not exist', 404);
    const file = await request.file();
    if (!file) return errorResponse(reply, 'INVALID_ASSET', 'An image file is required');
    const buffer = await file.toBuffer();
    const validation = mediaValidator.validateImage(buffer);
    if (!validation.isValid || !validation.format)
      return errorResponse(reply, 'INVALID_ASSET', validation.error ?? 'Invalid image');
    const assetPath = await templateStorage.saveAsset(
      template.id,
      'background',
      imageExtension(validation.format),
      buffer,
    );
    try {
      const updated = await templateRepository.setBackgroundPath(template.id, assetPath);
      if (!updated) {
        await templateStorage.removeAsset(assetPath);
        return errorResponse(reply, 'TEMPLATE_NOT_FOUND', 'Template does not exist', 404);
      }
      if (template.backgroundPath && template.backgroundPath !== updated.backgroundPath)
        await templateStorage.removeAsset(template.backgroundPath);
      return reply.send({ success: true, data: toTemplateDto(updated) });
    } catch (error) {
      await templateStorage.removeAsset(assetPath);
      throw error;
    }
  });

  fastify.post<{ Params: { id: string }; Querystring: { overlayId?: string } }>(
    '/templates/:id/overlays',
    async (request, reply) => {
      const template = await templateRepository.get(request.params.id);
      if (!template)
        return errorResponse(reply, 'TEMPLATE_NOT_FOUND', 'Template does not exist', 404);
      const file = await request.file();
      if (!file) return errorResponse(reply, 'INVALID_ASSET', 'An image file is required');
      const overlayId = request.query.overlayId ?? '';
      if (!/^[0-9a-f-]{36}$/i.test(overlayId))
        return errorResponse(reply, 'INVALID_ASSET', 'A valid overlay identifier is required');
      const buffer = await file.toBuffer();
      const validation = mediaValidator.validateImage(buffer);
      if (!validation.isValid || !validation.format)
        return errorResponse(reply, 'INVALID_ASSET', validation.error ?? 'Invalid image');
      const assetPath = await templateStorage.saveAsset(
        template.id,
        'overlay',
        imageExtension(validation.format),
        buffer,
      );
      try {
        const updated = await templateRepository.addOverlayPath(template.id, overlayId, assetPath);
        if (!updated) {
          await templateStorage.removeAsset(assetPath);
          return errorResponse(reply, 'OVERLAY_NOT_FOUND', 'Overlay label does not exist', 404);
        }
        return reply.send({ success: true, data: toTemplateDto(updated) });
      } catch (error) {
        await templateStorage.removeAsset(assetPath);
        throw error;
      }
    },
  );

  fastify.get<{ Params: { id: string } }>('/templates/:id/background', async (request, reply) => {
    const template = await templateRepository.get(request.params.id);
    if (!template || !template.backgroundPath)
      return errorResponse(reply, 'ASSET_NOT_FOUND', 'Background asset does not exist', 404);
    try {
      return reply
        .type(assetContentType(template.backgroundPath))
        .send(await templateStorage.readAsset(template.id, template.backgroundPath));
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT')
        return errorResponse(reply, 'ASSET_NOT_FOUND', 'Background asset does not exist', 404);
      throw error;
    }
  });

  fastify.get<{ Params: { id: string; overlayId: string } }>(
    '/templates/:id/overlays/:overlayId',
    async (request, reply) => {
      const template = await templateRepository.get(request.params.id);
      if (!template)
        return errorResponse(reply, 'ASSET_NOT_FOUND', 'Overlay asset does not exist', 404);
      const overlay = template.overlays.find((item) => item.id === request.params.overlayId);
      if (!overlay || !overlay.path)
        return errorResponse(reply, 'ASSET_NOT_FOUND', 'Overlay asset does not exist', 404);
      try {
        return reply
          .type(assetContentType(overlay.path))
          .send(await templateStorage.readAsset(template.id, overlay.path));
      } catch (error: unknown) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT')
          return errorResponse(reply, 'ASSET_NOT_FOUND', 'Overlay asset does not exist', 404);
        throw error;
      }
    },
  );
};

function assetContentType(filePath: string): string {
  const extension = filePath.toLowerCase().split('.').pop();
  return extension === 'svg' ? 'image/svg+xml' : extension === 'jpg' ? 'image/jpeg' : 'image/png';
}
