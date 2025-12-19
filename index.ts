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

// Register the UI resource as a template
// The URI must be unique, e.g., "ui://calculator"
server.registerResource(
  "calculator_ui",
  "ui://calculator",
  {
    mimeType: "text/html+skybridge", // Critical for ChatGPT to recognize this as a UI Widget
  },
  async (uri, extra) => {
    // Construct the HTML that loads our widget bundle
    // This matches the "Step 1" screenshot approach
    const widgetHtml = `
<div id="root"></div>
<script type="module" src="https://calculate-sum.zeabur.app/component.js"></script>
    `.trim();

    return {
      contents: [
        {
          uri: uri.href,
          mimeType: "text/html+skybridge",
          text: widgetHtml,
        },
      ],
    };
  }
);

server.tool(
  "calculate_sum",
  // @ts-ignore: Adding _meta to the tool definition as per OpenAI Apps SDK requirement
  {
    title: "Calculates the sum of two numbers",
    inputSchema: {
      type: "object",
      properties: {
        a: z.number().describe("The first number"),
        b: z.number().describe("The second number"),
      },
    },
    // This is the CRITICAL part from the docs
    _meta: {
      "openai/outputTemplate": "ui://calculator",
    },
  },
  {
    a: z.number().describe("The first number"),
    b: z.number().describe("The second number"),
  },
  async ({ a, b }) => {
    // Construct the absolute URL for the widget
    // We'll use the domain we configured or fall back to a placeholder if not set
    const domain = "https://calculate-sum.zeabur.app";
    const widgetUrl = `${domain}/component.js`;

    return {
      // Step 3 from your screenshot: Provide concise structured data for the widget
      structuredContent: {
        a,
        b,
        result: a + b,
      },
      content: [
        {
          type: "text",
          // Instruct the model to look at the UI
          text: `I have opened the calculator widget for you with inputs ${a} and ${b}. Please interact with the UI above.`,
        },
      ],
      _meta: {
        openai: {
          widget: {
            type: "javascript",
            url: widgetUrl,
          },
          // Standard way to link a resource template
          outputTemplate: "ui://calculator",

          // Imitating Figma's production-ready configuration
          widgetContext: {
            // Allows the widget to connect back to this server
            connect_domains: [domain],
            // Allows loading images/scripts from these domains
            resource_domains: [domain],
          },
          // UI Preference
          widgetPrefersBorder: true,
          widgetTitle: "Calculator",
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
