import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  type CallToolRequest,
  type ListResourceTemplatesRequest,
  type ListResourcesRequest,
  type ListToolsRequest,
  type ReadResourceRequest,
  type Resource,
  type ResourceTemplate,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

// ============================================================================
// Widget Configuration
// ============================================================================

type CalculatorWidget = {
  id: string;
  title: string;
  templateUri: string;
  invoking: string;
  invoked: string;
  html: string;
  responseText: string;
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.resolve(__dirname, "dist");

/**
 * Reads the widget HTML file from the dist directory.
 * The component.tsx is bundled into dist/component.js, and we wrap it in HTML.
 */
function getWidgetHtml(): string {
  // For the widget, we generate HTML that loads our bundled React component
  // In production, this should use your deployed domain
  const domain =
    process.env.WIDGET_DOMAIN || "https://calculate-sum.zeabur.app";

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="${domain}/component.js"></script>
</body>
</html>`;
}

/**
 * Creates the _meta descriptor for tool definitions and resources.
 * This tells ChatGPT how to handle the widget.
 */
function widgetDescriptorMeta(widget: CalculatorWidget) {
  // Get the widget domain from environment or use default
  const widgetDomain =
    process.env.WIDGET_DOMAIN || "https://calculate-sum.zeabur.app";

  return {
    "openai/outputTemplate": widget.templateUri,
    "openai/toolInvocation/invoking": widget.invoking,
    "openai/toolInvocation/invoked": widget.invoked,
    "openai/widgetAccessible": true,
    // Required for app submission: Widget Domain
    "openai/widgetDomain": widgetDomain,
    // Required for app submission: Content Security Policy
    "openai/widgetCSP": {
      // Domains the widget can connect to (for API calls)
      connect_domains: [widgetDomain],
      // Domains for loading static resources (images, fonts, scripts)
      resource_domains: [widgetDomain],
      // Optional: Allow embedding iframes from these domains
      // frame_domains: [], // Not needed for our calculator widget
    },
    // Optional: Widget UI preference
    "openai/widgetPrefersBorder": true,
  } as const;
}

/**
 * Creates the _meta for tool invocation responses.
 */
function widgetInvocationMeta(widget: CalculatorWidget) {
  return {
    "openai/toolInvocation/invoking": widget.invoking,
    "openai/toolInvocation/invoked": widget.invoked,
  } as const;
}

// Define our calculator widget
const calculatorWidget: CalculatorWidget = {
  id: "calculate_sum",
  title: "Calculate Sum",
  templateUri: "ui://widget/calculator.html",
  invoking: "Opening calculator...",
  invoked: "Calculator ready",
  html: getWidgetHtml(),
  responseText: "Calculator widget rendered!",
};

// ============================================================================
// MCP Protocol Definitions
// ============================================================================

const toolInputSchema = {
  type: "object" as const,
  properties: {
    a: {
      type: "number",
      description: "The first number to add",
    },
    b: {
      type: "number",
      description: "The second number to add",
    },
  },
  required: ["a", "b"] as string[],
  additionalProperties: false,
};

const toolInputParser = z.object({
  a: z.number(),
  b: z.number(),
});

// Tools list - exposed via ListTools
const tools: Tool[] = [
  {
    name: calculatorWidget.id,
    description: "Calculates the sum of two numbers and shows a calculator UI",
    inputSchema: toolInputSchema,
    // @ts-ignore - _meta is an extension for OpenAI Apps SDK
    title: calculatorWidget.title,
    _meta: widgetDescriptorMeta(calculatorWidget),
    // Annotations to control approval prompts
    annotations: {
      destructiveHint: false,
      openWorldHint: false,
      readOnlyHint: true,
    },
  },
];

// Resources list - exposed via ListResources
const resources: Resource[] = [
  {
    uri: calculatorWidget.templateUri,
    name: calculatorWidget.title,
    description: `${calculatorWidget.title} widget markup`,
    mimeType: "text/html+skybridge",
    // @ts-ignore - _meta is an extension for OpenAI Apps SDK
    _meta: widgetDescriptorMeta(calculatorWidget),
  },
];

// Resource templates - exposed via ListResourceTemplates
const resourceTemplates: ResourceTemplate[] = [
  {
    uriTemplate: calculatorWidget.templateUri,
    name: calculatorWidget.title,
    description: `${calculatorWidget.title} widget markup`,
    mimeType: "text/html+skybridge",
    // @ts-ignore - _meta is an extension for OpenAI Apps SDK
    _meta: widgetDescriptorMeta(calculatorWidget),
  },
];

// ============================================================================
// MCP Server Factory
// ============================================================================

function createCalculatorServer(): Server {
  const server = new Server(
    {
      name: "calculator-mcp",
      version: "1.0.0",
    },
    {
      capabilities: {
        resources: {},
        tools: {},
      },
    }
  );

  // Handler: List available resources
  server.setRequestHandler(
    ListResourcesRequestSchema,
    async (_request: ListResourcesRequest) => ({
      resources,
    })
  );

  // Handler: Read a specific resource (returns the widget HTML)
  server.setRequestHandler(
    ReadResourceRequestSchema,
    async (request: ReadResourceRequest) => {
      if (request.params.uri !== calculatorWidget.templateUri) {
        throw new Error(`Unknown resource: ${request.params.uri}`);
      }

      return {
        contents: [
          {
            uri: calculatorWidget.templateUri,
            mimeType: "text/html+skybridge",
            text: calculatorWidget.html,
            // @ts-ignore
            _meta: widgetDescriptorMeta(calculatorWidget),
          },
        ],
      };
    }
  );

  // Handler: List resource templates
  server.setRequestHandler(
    ListResourceTemplatesRequestSchema,
    async (_request: ListResourceTemplatesRequest) => ({
      resourceTemplates,
    })
  );

  // Handler: List available tools
  server.setRequestHandler(
    ListToolsRequestSchema,
    async (_request: ListToolsRequest) => ({
      tools,
    })
  );

  // Handler: Call a tool
  server.setRequestHandler(
    CallToolRequestSchema,
    async (request: CallToolRequest) => {
      if (request.params.name !== calculatorWidget.id) {
        throw new Error(`Unknown tool: ${request.params.name}`);
      }

      const args = toolInputParser.parse(request.params.arguments ?? {});
      const sum = args.a + args.b;

      return {
        content: [
          {
            type: "text",
            text: `The sum of ${args.a} and ${args.b} is ${sum}. ${calculatorWidget.responseText}`,
          },
        ],
        structuredContent: {
          a: args.a,
          b: args.b,
          result: sum,
        },
        _meta: widgetInvocationMeta(calculatorWidget),
      };
    }
  );

  return server;
}

// ============================================================================
// Session Management
// ============================================================================

type SessionRecord = {
  server: Server;
  transport: SSEServerTransport;
};

const sessions = new Map<string, SessionRecord>();

const ssePath = "/mcp";
const postPath = "/mcp/messages";

// ============================================================================
// HTTP Request Handlers
// ============================================================================

async function handleSseRequest(res: ServerResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  const server = createCalculatorServer();
  const transport = new SSEServerTransport(postPath, res);
  const sessionId = transport.sessionId;

  sessions.set(sessionId, { server, transport });
  console.log(`New SSE session: ${sessionId}`);

  transport.onclose = async () => {
    console.log(`SSE session closed: ${sessionId}`);
    sessions.delete(sessionId);
    await server.close();
  };

  transport.onerror = (error) => {
    console.error("SSE transport error:", error);
  };

  try {
    await server.connect(transport);
  } catch (error) {
    sessions.delete(sessionId);
    console.error("Failed to start SSE session:", error);
    if (!res.headersSent) {
      res.writeHead(500).end("Failed to establish SSE connection");
    }
  }
}

async function handlePostMessage(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL
) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "content-type");

  const sessionId = url.searchParams.get("sessionId");

  if (!sessionId) {
    res.writeHead(400).end("Missing sessionId query parameter");
    return;
  }

  const session = sessions.get(sessionId);

  if (!session) {
    res.writeHead(404).end("Unknown session");
    return;
  }

  try {
    await session.transport.handlePostMessage(req, res);
  } catch (error) {
    console.error("Failed to process message:", error);
    if (!res.headersSent) {
      res.writeHead(500).end("Failed to process message");
    }
  }
}

/**
 * Serves static files from the dist directory.
 */
function serveStaticFile(
  req: IncomingMessage,
  res: ServerResponse,
  filePath: string,
  contentType: string
) {
  const fullPath = path.join(__dirname, filePath);

  if (!fs.existsSync(fullPath)) {
    res.writeHead(404).end("File not found");
    return;
  }

  res.setHeader("Content-Type", contentType);
  res.setHeader("Access-Control-Allow-Origin", "*");
  fs.createReadStream(fullPath).pipe(res);
}

/**
 * Handle the /calculate API endpoint for direct widget-to-backend calls.
 */
async function handleCalculateApi(req: IncomingMessage, res: ServerResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  res.setHeader("Content-Type", "application/json");

  let body = "";
  for await (const chunk of req) {
    body += chunk;
  }

  try {
    const { a, b } = JSON.parse(body);

    if (typeof a !== "number" || typeof b !== "number") {
      res.writeHead(400).end(JSON.stringify({ error: "Invalid inputs" }));
      return;
    }

    res.writeHead(200).end(JSON.stringify({ result: a + b }));
  } catch (error) {
    res.writeHead(400).end(JSON.stringify({ error: "Invalid JSON" }));
  }
}

// ============================================================================
// HTTP Server
// ============================================================================

const portEnv = Number(process.env.PORT ?? 3000);
const port = Number.isFinite(portEnv) ? portEnv : 3000;

const httpServer = createServer(
  async (req: IncomingMessage, res: ServerResponse) => {
    if (!req.url) {
      res.writeHead(400).end("Missing URL");
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);

    // Handle CORS preflight
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "content-type",
      });
      res.end();
      return;
    }

    // SSE endpoint for MCP
    if (req.method === "GET" && url.pathname === ssePath) {
      await handleSseRequest(res);
      return;
    }

    // POST endpoint for MCP messages
    if (req.method === "POST" && url.pathname === postPath) {
      await handlePostMessage(req, res, url);
      return;
    }

    // API endpoint for direct widget calculations
    if (req.method === "POST" && url.pathname === "/calculate") {
      await handleCalculateApi(req, res);
      return;
    }

    // Serve the bundled React component
    // Note: When running from dist/index.js, component.js is in the same directory
    if (req.method === "GET" && url.pathname === "/component.js") {
      serveStaticFile(req, res, "component.js", "application/javascript");
      return;
    }

    // Serve index.html for root (from project root, not dist)
    if (req.method === "GET" && url.pathname === "/") {
      const projectRoot = path.resolve(__dirname, "..");
      const htmlPath = path.join(projectRoot, "index.html");
      if (fs.existsSync(htmlPath)) {
        res.setHeader("Content-Type", "text/html");
        res.setHeader("Access-Control-Allow-Origin", "*");
        fs.createReadStream(htmlPath).pipe(res);
      } else {
        res.writeHead(404).end("index.html not found");
      }
      return;
    }

    // 404 for everything else
    res.writeHead(404).end("Not Found");
  }
);

httpServer.on("clientError", (err: Error, socket) => {
  console.error("HTTP client error:", err);
  socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
});

httpServer.listen(port, () => {
  console.log(`Calculator MCP server listening on http://localhost:${port}`);
  console.log(`  SSE stream:     GET  http://localhost:${port}${ssePath}`);
  console.log(
    `  Message post:   POST http://localhost:${port}${postPath}?sessionId=...`
  );
  console.log(`  Widget bundle:  GET  http://localhost:${port}/component.js`);
  console.log(`  Calculate API:  POST http://localhost:${port}/calculate`);
});
