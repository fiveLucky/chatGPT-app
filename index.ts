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
// When running from dist/index.js, __dirname is dist/, so assets is at ../assets
// Try multiple possible paths for robustness
const ASSETS_DIR = (() => {
  const possiblePaths = [
    path.resolve(__dirname, "..", "assets"), // assets from project root (when running from dist/index.js)
    path.resolve(process.cwd(), "assets"), // assets from cwd (for Docker and direct execution)
    path.resolve(__dirname, "assets"), // dist/assets (fallback)
  ];

  for (const possiblePath of possiblePaths) {
    if (fs.existsSync(possiblePath)) {
      console.log(`Using ASSETS_DIR: ${possiblePath}`);
      return possiblePath;
    }
  }

  // Fallback to project root/assets
  const fallback = path.resolve(__dirname, "..", "assets");
  console.warn(`ASSETS_DIR not found, using fallback: ${fallback}`);
  return fallback;
})();
const ROOT_DIR = path.resolve(__dirname);

/**
 * Reads the widget HTML file from the assets directory.
 */
function readWidgetHtml(widgetName: string): string {
  const htmlPath = path.join(ASSETS_DIR, `${widgetName}.html`);

  if (fs.existsSync(htmlPath)) {
    return fs.readFileSync(htmlPath, "utf-8");
  }

  // Fallback: generate HTML if file doesn't exist
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
  <div id="${widgetName}-root"></div>
  <script type="module" src="${domain}/assets/${widgetName}.js"></script>
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

// Define all calculator widgets
const widgets: CalculatorWidget[] = [
  {
    id: "add",
    title: "Addition Calculator",
    templateUri: "ui://widget/add.html",
    invoking: "Opening addition calculator...",
    invoked: "Addition calculator ready",
    html: readWidgetHtml("add"),
    responseText: "Addition calculator rendered!",
  },
  {
    id: "subtract",
    title: "Subtraction Calculator",
    templateUri: "ui://widget/subtract.html",
    invoking: "Opening subtraction calculator...",
    invoked: "Subtraction calculator ready",
    html: readWidgetHtml("subtract"),
    responseText: "Subtraction calculator rendered!",
  },
  {
    id: "multiply",
    title: "Multiplication Calculator",
    templateUri: "ui://widget/multiply.html",
    invoking: "Opening multiplication calculator...",
    invoked: "Multiplication calculator ready",
    html: readWidgetHtml("multiply"),
    responseText: "Multiplication calculator rendered!",
  },
  {
    id: "divide",
    title: "Division Calculator",
    templateUri: "ui://widget/divide.html",
    invoking: "Opening division calculator...",
    invoked: "Division calculator ready",
    html: readWidgetHtml("divide"),
    responseText: "Division calculator rendered!",
  },
  {
    id: "super-calculator",
    title: "Super Calculator",
    templateUri: "ui://widget/super-calculator.html",
    invoking: "Opening super calculator...",
    invoked: "Super calculator ready",
    html: readWidgetHtml("super-calculator"),
    responseText: "Super calculator rendered!",
  },
];

const widgetsById = new Map<string, CalculatorWidget>();
const widgetsByUri = new Map<string, CalculatorWidget>();

widgets.forEach((widget) => {
  widgetsById.set(widget.id, widget);
  widgetsByUri.set(widget.templateUri, widget);
});

// ============================================================================
// MCP Protocol Definitions
// ============================================================================

// Common tool input schema for basic operations
const basicToolInputSchema = {
  type: "object" as const,
  properties: {
    a: {
      type: "number",
      description: "The first number",
    },
    b: {
      type: "number",
      description: "The second number",
    },
  },
  required: ["a", "b"] as string[],
  additionalProperties: false,
};

// Tool input schema for super calculator
const superCalculatorInputSchema = {
  type: "object" as const,
  properties: {
    a: {
      type: "number",
      description: "The first number",
    },
    b: {
      type: "number",
      description: "The second number",
    },
    operation: {
      type: "string",
      enum: ["add", "subtract", "multiply", "divide"],
      description: "The operation to perform",
    },
  },
  required: ["a", "b", "operation"] as string[],
  additionalProperties: false,
};

const basicToolInputParser = z.object({
  a: z.number(),
  b: z.number(),
});

const superCalculatorInputParser = z.object({
  a: z.number(),
  b: z.number(),
  operation: z.enum(["add", "subtract", "multiply", "divide"]),
});

// Tools list - exposed via ListTools
const tools: Tool[] = widgets.map((widget) => ({
  name: widget.id,
  description:
    widget.id === "super-calculator"
      ? "A super calculator that can perform addition, subtraction, multiplication, and division operations"
      : `Performs ${widget.title.toLowerCase()} and shows a calculator UI`,
  inputSchema:
    widget.id === "super-calculator"
      ? superCalculatorInputSchema
      : basicToolInputSchema,
  // @ts-ignore - _meta is an extension for OpenAI Apps SDK
  title: widget.title,
  _meta: widgetDescriptorMeta(widget),
  // Annotations to control approval prompts
  annotations: {
    destructiveHint: false,
    openWorldHint: false,
    readOnlyHint: true,
  },
}));

// Resources list - exposed via ListResources
const resources: Resource[] = widgets.map((widget) => ({
  uri: widget.templateUri,
  name: widget.title,
  description: `${widget.title} widget markup`,
  mimeType: "text/html+skybridge",
  // @ts-ignore - _meta is an extension for OpenAI Apps SDK
  _meta: widgetDescriptorMeta(widget),
}));

// Resource templates - exposed via ListResourceTemplates
const resourceTemplates: ResourceTemplate[] = widgets.map((widget) => ({
  uriTemplate: widget.templateUri,
  name: widget.title,
  description: `${widget.title} widget markup`,
  mimeType: "text/html+skybridge",
  // @ts-ignore - _meta is an extension for OpenAI Apps SDK
  _meta: widgetDescriptorMeta(widget),
}));

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
      const widget = widgetsByUri.get(request.params.uri);

      if (!widget) {
        throw new Error(`Unknown resource: ${request.params.uri}`);
      }

      // Reload HTML in case it was updated
      widget.html = readWidgetHtml(widget.id);

      return {
        contents: [
          {
            uri: widget.templateUri,
            mimeType: "text/html+skybridge",
            text: widget.html,
            // @ts-ignore
            _meta: widgetDescriptorMeta(widget),
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
      const widget = widgetsById.get(request.params.name);

      if (!widget) {
        throw new Error(`Unknown tool: ${request.params.name}`);
      }

      let result: number;
      let operationText: string;
      let parsedArgs: { a: number; b: number; operation?: string };

      if (widget.id === "super-calculator") {
        parsedArgs = superCalculatorInputParser.parse(
          request.params.arguments ?? {}
        );
        switch (parsedArgs.operation) {
          case "add":
            result = parsedArgs.a + parsedArgs.b;
            operationText = `sum of ${parsedArgs.a} and ${parsedArgs.b}`;
            break;
          case "subtract":
            result = parsedArgs.a - parsedArgs.b;
            operationText = `difference of ${parsedArgs.a} and ${parsedArgs.b}`;
            break;
          case "multiply":
            result = parsedArgs.a * parsedArgs.b;
            operationText = `product of ${parsedArgs.a} and ${parsedArgs.b}`;
            break;
          case "divide":
            if (parsedArgs.b === 0) {
              throw new Error("Cannot divide by zero");
            }
            result = parsedArgs.a / parsedArgs.b;
            operationText = `quotient of ${parsedArgs.a} and ${parsedArgs.b}`;
            break;
          default:
            throw new Error(`Unknown operation: ${parsedArgs.operation}`);
        }
      } else {
        parsedArgs = basicToolInputParser.parse(request.params.arguments ?? {});
        switch (widget.id) {
          case "add":
            result = parsedArgs.a + parsedArgs.b;
            operationText = `sum of ${parsedArgs.a} and ${parsedArgs.b}`;
            break;
          case "subtract":
            result = parsedArgs.a - parsedArgs.b;
            operationText = `difference of ${parsedArgs.a} and ${parsedArgs.b}`;
            break;
          case "multiply":
            result = parsedArgs.a * parsedArgs.b;
            operationText = `product of ${parsedArgs.a} and ${parsedArgs.b}`;
            break;
          case "divide":
            if (parsedArgs.b === 0) {
              throw new Error("Cannot divide by zero");
            }
            result = parsedArgs.a / parsedArgs.b;
            operationText = `quotient of ${parsedArgs.a} and ${parsedArgs.b}`;
            break;
          default:
            throw new Error(`Unknown operation: ${widget.id}`);
        }
      }

      return {
        content: [
          {
            type: "text",
            text: `The ${operationText} is ${result}. ${widget.responseText}`,
          },
        ],
        structuredContent: {
          a: parsedArgs.a,
          b: parsedArgs.b,
          ...(widget.id === "super-calculator" && {
            operation: parsedArgs.operation,
          }),
          result,
        },
        _meta: widgetInvocationMeta(widget),
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
  logRequest("GET", "/mcp", undefined, undefined);
  console.log(`  → New SSE session: ${sessionId}`);

  transport.onclose = async () => {
    console.log(`  → SSE session closed: ${sessionId}`);
    sessions.delete(sessionId);
    await server.close();
  };

  transport.onerror = (error) => {
    logError(`SSE transport error for session ${sessionId}`, error);
  };

  try {
    await server.connect(transport);
  } catch (error) {
    sessions.delete(sessionId);
    logError(`Failed to start SSE session ${sessionId}`, error);
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
  console.log(`  → Processing MCP message for session: ${sessionId || "none"}`);

  if (!sessionId) {
    logError("Missing sessionId in POST /mcp/messages");
    res.writeHead(400).end("Missing sessionId query parameter");
    return;
  }

  const session = sessions.get(sessionId);

  if (!session) {
    logError(`Unknown session: ${sessionId}`);
    res.writeHead(404).end("Unknown session");
    return;
  }

  try {
    await session.transport.handlePostMessage(req, res);
  } catch (error) {
    logError(`Failed to process message for session ${sessionId}`, error);
    if (!res.headersSent) {
      res.writeHead(500).end("Failed to process message");
    }
  }
}

/**
 * Serves static files from the assets directory.
 */
function serveStaticFile(
  req: IncomingMessage,
  res: ServerResponse,
  fileName: string,
  contentType: string
) {
  const fullPath = path.join(ASSETS_DIR, fileName);

  if (!fs.existsSync(fullPath)) {
    logError(`File not found: ${fileName}`);
    console.error(`  → Expected path: ${fullPath}`);
    console.error(`  → ASSETS_DIR: ${ASSETS_DIR}`);
    console.error(`  → __dirname: ${__dirname}`);
    console.error(`  → process.cwd(): ${process.cwd()}`);
    res.writeHead(404).end(`File not found: ${fileName}`);
    return;
  }

  console.log(`  → Serving ${fileName} from: ${fullPath}`);

  // Set CORS headers before sending the file
  // Critical for ChatGPT sandbox to load the script
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Content-Type", contentType);
  res.setHeader("Cache-Control", "public, max-age=3600");

  // Send the file
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
    console.log(`  → Calculate request: a=${a}, b=${b}`);

    if (typeof a !== "number" || typeof b !== "number") {
      logError(`Invalid inputs: a=${a} (${typeof a}), b=${b} (${typeof b})`);
      res.writeHead(400).end(JSON.stringify({ error: "Invalid inputs" }));
      return;
    }

    const result = a + b;
    console.log(`  → Calculate result: ${result}`);
    res.writeHead(200).end(JSON.stringify({ result }));
  } catch (error) {
    logError("Failed to parse calculate request body", error);
    res.writeHead(400).end(JSON.stringify({ error: "Invalid JSON" }));
  }
}

// ============================================================================
// Logging Utilities
// ============================================================================

/**
 * Formats a timestamp for logging
 */
function getTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Logs incoming HTTP requests
 */
function logRequest(
  method: string,
  pathname: string,
  statusCode?: number,
  duration?: number
) {
  const timestamp = getTimestamp();
  const status = statusCode ? ` [${statusCode}]` : "";
  const time = duration ? ` (${duration}ms)` : "";
  console.log(`[${timestamp}] ${method} ${pathname}${status}${time}`);
}

/**
 * Logs errors
 */
function logError(message: string, error?: unknown) {
  const timestamp = getTimestamp();
  console.error(`[${timestamp}] ERROR: ${message}`, error || "");
}

// ============================================================================
// HTTP Server
// ============================================================================

const portEnv = Number(process.env.PORT ?? 3000);
const port = Number.isFinite(portEnv) ? portEnv : 3000;

const httpServer = createServer(
  async (req: IncomingMessage, res: ServerResponse) => {
    const startTime = Date.now();
    const method = req.method || "UNKNOWN";
    let pathname = "unknown";

    try {
      if (!req.url) {
        logRequest(method, "unknown", 400);
        res.writeHead(400).end("Missing URL");
        return;
      }

      const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);
      pathname = url.pathname;

      // Log incoming request
      logRequest(method, pathname);

      // Track response status
      let statusCode = 200;
      const originalEnd = res.end.bind(res);
      res.end = function (
        chunk?: any,
        encoding?: any,
        cb?: () => void
      ): ServerResponse {
        const duration = Date.now() - startTime;
        statusCode = res.statusCode || 200;
        logRequest(method, pathname, statusCode, duration);
        return originalEnd(chunk, encoding, cb);
      };

      // Handle CORS preflight for all paths
      // Critical for ChatGPT sandbox to load resources
      if (req.method === "OPTIONS") {
        res.writeHead(204, {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Accept",
          "Access-Control-Max-Age": "86400", // Cache preflight for 24 hours
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

      // Serve static assets (JS, CSS files from assets directory)
      // IMPORTANT: This must come BEFORE the root "/" and ".well-known" handlers
      if (req.method === "GET" && url.pathname.startsWith("/assets/")) {
        let fileName = url.pathname.slice("/assets/".length); // Remove "/assets/" prefix

        if (fileName && !fileName.includes("..")) {
          // Only serve files that exist in assets directory
          // Security: prevent directory traversal
          const fullPath = path.join(ASSETS_DIR, fileName);
          const normalizedPath = path.normalize(fullPath);
          const normalizedAssetsDir = path.normalize(ASSETS_DIR);

          // Ensure the resolved path is within ASSETS_DIR
          const isWithinAssetsDir = normalizedPath.startsWith(
            normalizedAssetsDir + path.sep
          );

          if (isWithinAssetsDir && fs.existsSync(normalizedPath)) {
            try {
              const stats = fs.statSync(normalizedPath);
              if (stats.isFile()) {
                // Determine content type
                let contentType = "application/octet-stream";
                if (fileName.endsWith(".js")) {
                  contentType = "application/javascript";
                } else if (fileName.endsWith(".css")) {
                  contentType = "text/css";
                } else if (fileName.endsWith(".html")) {
                  contentType = "text/html";
                }

                serveStaticFile(req, res, fileName, contentType);
                return;
              }
            } catch (error) {
              console.error(`Error serving static file ${fileName}:`, error);
              // File access error, fall through to 404
            }
          }
        }
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

      // Serve domain verification file for OpenAI Apps
      if (
        req.method === "GET" &&
        url.pathname === "/.well-known/openai-apps-challenge"
      ) {
        const projectRoot = path.resolve(__dirname, "..");
        const verificationPath = path.join(
          projectRoot,
          ".well-known",
          "openai-apps-challenge"
        );
        if (fs.existsSync(verificationPath)) {
          res.setHeader("Content-Type", "text/plain");
          res.setHeader("Access-Control-Allow-Origin", "*");
          fs.createReadStream(verificationPath).pipe(res);
        } else {
          res.writeHead(404).end("Verification file not found");
        }
        return;
      }

      // 404 for everything else
      logRequest(method, pathname, 404);
      res.writeHead(404).end("Not Found");
    } catch (error) {
      const duration = Date.now() - startTime;
      logError(`Unhandled error processing ${method} ${pathname}`, error);
      if (!res.headersSent) {
        res.writeHead(500).end("Internal Server Error");
      }
      logRequest(method, pathname, 500, duration);
    }
  }
);

// Handle server errors
httpServer.on("error", (err: Error) => {
  logError("HTTP server error", err);
});

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
  console.log(`  Static assets:  GET  http://localhost:${port}/assets/*`);
  console.log(`  Available tools: ${widgets.map((w) => w.id).join(", ")}`);

  // Verify assets directory exists
  if (fs.existsSync(ASSETS_DIR)) {
    const assetFiles = fs.readdirSync(ASSETS_DIR);
    console.log(`✓ Assets directory found with ${assetFiles.length} files`);
  } else {
    console.warn(`⚠ Assets directory not found at: ${ASSETS_DIR}`);
    console.warn(`  Run 'pnpm build' to build the widgets`);
  }
});
