import Fastify from "fastify";

const server = Fastify();

server.get("/health", async () => ({ status: "ok" }));

await server.listen({ host: "0.0.0.0", port: 3000 });
