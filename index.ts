import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { z } from "zod";
import path from "path";

const app = express();
app.use(express.json());

// Serve static files
const staticDir = process.cwd();
console.log(`Serving static files from: ${staticDir}`);
app.use(express.static(staticDir));
// Specifically serve the built component bundle
// Note: path.join works better with relative paths than serving staticDir directly again with a specific file
app.get("/component.js", (req, res) => {
  res.sendFile(path.join(staticDir, "dist/component.js"));
});

const server = new McpServer({
  name: "chatgpt-app-demo",
  version: "1.0.0",
});

server.tool(
  "calculate_sum",
  "Calculates the sum of two numbers",
  {
    a: z.number().describe("The first number"),
    b: z.number().describe("The second number"),
  },
  async ({ a, b }) => {
    return {
      content: [
        {
          type: "text",
          text: String(a + b),
        },
      ],
      // Add metadata for Apps SDK to trigger the widget
      // This is the experimental way to hint ChatGPT to load the widget
      _meta: {
        openai: {
          widget: {
            type: "javascript",
            url: "/component.js", // This will be resolved relative to your server
          },
        },
      },
    };
  }
);

// Map to store transports by session ID
const transports = new Map<string, SSEServerTransport>();

app.post("/calculate", (req, res) => {
  const { a, b } = req.body;
  if (typeof a !== "number" || typeof b !== "number") {
    res.status(400).json({ error: "Invalid inputs" });
    return;
  }
  res.json({ result: a + b });
});

app.get("/mcp", async (req, res) => {
  const transport = new SSEServerTransport("/messages", res);
  const sessionId = transport.sessionId;

  transports.set(sessionId, transport);
  console.log(`New SSE connection: ${sessionId}`);

  transport.onclose = () => {
    console.log(`SSE connection closed: ${sessionId}`);
    transports.delete(sessionId);
  };

  await server.connect(transport);
});

app.post("/messages", async (req, res) => {
  const sessionId = req.query.sessionId as string;

  if (!sessionId) {
    res.status(400).send("Missing sessionId");
    return;
  }

  const transport = transports.get(sessionId);
  if (!transport) {
    res.status(404).send("Session not found");
    return;
  }

  await transport.handlePostMessage(req, res, req.body);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(
    `ChatGPT App (MCP Server) running on http://localhost:${PORT}/mcp`
  );
});
