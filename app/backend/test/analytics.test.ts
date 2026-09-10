import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { dbRepository } from '../src/db/repository.js';
import { classifyTemplateLayout } from '../src/services/layout-classifier.js';

describe('Analytics & KPI Engine', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Layout Classifier', () => {
    it('correctly classifies Flipbook layout', () => {
      const result = classifyTemplateLayout('flipbook', []);
      expect(result.category).toBe('flipbook');
      expect(result.label).toBe('Flipbook Booklet');
    });

    it('correctly classifies 2-Cut Split Couple duplicate layout (4 shots x 8 slots)', () => {
      const splitPlacements = [
        // Left strip (4 shots)
        { x: 50, y: 100, width: 500, height: 350, captureIndex: 1 },
        { x: 50, y: 500, width: 500, height: 350, captureIndex: 2 },
        { x: 50, y: 900, width: 500, height: 350, captureIndex: 3 },
        { x: 50, y: 1300, width: 500, height: 350, captureIndex: 4 },
        // Right strip (4 duplicate shots)
        { x: 650, y: 100, width: 500, height: 350, captureIndex: 1 },
        { x: 650, y: 500, width: 500, height: 350, captureIndex: 2 },
        { x: 650, y: 900, width: 500, height: 350, captureIndex: 3 },
        { x: 650, y: 1300, width: 500, height: 350, captureIndex: 4 },
      ];

      const result = classifyTemplateLayout('photo_strip', splitPlacements, 1200, 1800);
      expect(result.category).toBe('2_cut_split');
      expect(result.label).toContain('2-Cut Split');
    });

    it('correctly classifies 4-Cut Quad layout (2x2 grid)', () => {
      const quadPlacements = [
        { x: 50, y: 50, width: 500, height: 800, captureIndex: 1 },
        { x: 650, y: 500, width: 500, height: 800, captureIndex: 2 },
        { x: 50, y: 950, width: 500, height: 800, captureIndex: 3 },
        { x: 650, y: 950, width: 500, height: 800, captureIndex: 4 },
      ];

      const result = classifyTemplateLayout('photo_strip', quadPlacements, 1200, 1800);
      expect(result.category).toBe('4_cut_quad');
      expect(result.label).toBe('4-Cut Quad');
    });

    it('correctly classifies Single Vertical Strip layout', () => {
      const singlePlacements = [
        { x: 100, y: 100, width: 1000, height: 450, captureIndex: 1 },
        { x: 100, y: 600, width: 1000, height: 450, captureIndex: 2 },
        { x: 100, y: 1100, width: 1000, height: 450, captureIndex: 3 },
      ];

      const result = classifyTemplateLayout('photo_strip', singlePlacements, 1200, 1800);
      expect(result.category).toBe('single_strip');
      expect(result.label).toContain('Single Strip');
    });
  });

  describe('GET /api/admin/analytics Endpoint', () => {
    it('returns structured analytics data with summary, templates, layout breakdown, and comparison', async () => {
      // Create mock event
      const event = await dbRepository.createEvent({
        name: 'Analytics Test Event',
        date: '2026-09-10',
        operatorName: 'SIC Admin',
      });

      // Create session 1: Single strip, 1 copy
      const s1 = await dbRepository.createSession(event.id, 'photo_strip', 'token-s1');
      s1.templateSnapshot = {
        id: 'template-single-1',
        name: 'Classic 3-Pose Strip',
        placements: [
          { x: 100, y: 100, width: 1000, height: 400, captureIndex: 1 },
          { x: 100, y: 550, width: 1000, height: 400, captureIndex: 2 },
          { x: 100, y: 1000, width: 1000, height: 400, captureIndex: 3 },
        ],
      };
      await dbRepository.updateSessionState(s1.id, 'booth_confirmed');
      await dbRepository.recordPrintStatus(s1.id, 1);

      // Create session 2: 2-Cut Split Couple design, 3 copies (Reprint driver!)
      const s2 = await dbRepository.createSession(event.id, 'photo_strip', 'token-s2');
      s2.templateSnapshot = {
        id: 'template-split-couple',
        name: 'Couple Heart Split 8-Slot',
        placements: [
          { x: 50, y: 100, width: 500, height: 350, captureIndex: 1 },
          { x: 50, y: 500, width: 500, height: 350, captureIndex: 2 },
          { x: 50, y: 900, width: 500, height: 350, captureIndex: 3 },
          { x: 50, y: 1300, width: 500, height: 350, captureIndex: 4 },
          { x: 650, y: 100, width: 500, height: 350, captureIndex: 1 },
          { x: 650, y: 500, width: 500, height: 350, captureIndex: 2 },
          { x: 650, y: 900, width: 500, height: 350, captureIndex: 3 },
          { x: 650, y: 1300, width: 500, height: 350, captureIndex: 4 },
        ],
      };
      await dbRepository.updateSessionState(s2.id, 'booth_confirmed');
      await dbRepository.recordPrintStatus(s2.id, 3);

      // Create session 3: Flipbook, 2 copies
      const s3 = await dbRepository.createSession(event.id, 'flipbook', 'token-s3');
      s3.templateSnapshot = {
        id: 'frame-flipbook-arcade',
        name: 'GenSIC Arcade Flipbook',
      };
      await dbRepository.updateSessionState(s3.id, 'booth_confirmed');
      await dbRepository.recordPrintStatus(s3.id, 2);

      // Request analytics from endpoint
      const res = await app.inject({
        method: 'GET',
        url: `/api/admin/analytics?eventId=${event.id}`,
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      const data = body.data;

      // 1. Summary validation
      expect(data.summary.totalSessions).toBe(3);
      expect(data.summary.totalPrints).toBe(6); // 1 + 3 + 2 = 6
      expect(data.summary.averageCopiesPerSession).toBe(2.0); // 6 / 3 = 2.0
      expect(data.summary.overallReprintRate).toBe(66.7); // 2 out of 3 sessions had >1 copy

      // 2. Type Comparison validation
      const stripType = data.typeComparison.find((t: any) => t.type === 'photo_strip');
      const flipType = data.typeComparison.find((t: any) => t.type === 'flipbook');
      expect(stripType.sessions).toBe(2);
      expect(stripType.totalPrints).toBe(4);
      expect(flipType.sessions).toBe(1);
      expect(flipType.totalPrints).toBe(2);

      // 3. Template Leaderboard
      const splitTemplate = data.templates.find((t: any) => t.templateId === 'template-split-couple');
      expect(splitTemplate).toBeDefined();
      expect(splitTemplate.totalPrints).toBe(3);
      expect(splitTemplate.averageCopies).toBe(3.0);
      expect(splitTemplate.reprintRate).toBe(100);
      expect(splitTemplate.layoutCategory).toBe('2_cut_split');

      // 4. Layout Category Breakdown (identifies 2_cut_split as highest reprint driver)
      const splitLayout = data.layoutBreakdown.find((l: any) => l.category === '2_cut_split');
      expect(splitLayout).toBeDefined();
      expect(splitLayout.reprintRate).toBe(100);
      expect(splitLayout.averageCopies).toBe(3.0);

      // 5. Copies distribution
      expect(data.copiesDistribution.oneCopy).toBe(1);
      expect(data.copiesDistribution.twoCopies).toBe(1);
      expect(data.copiesDistribution.threeCopies).toBe(1);
    });
  });
});
