# ChatGPT App Demo (MCP Server)

This is a starter template for a ChatGPT App built using the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/).

## Prerequisites

- Node.js (v18 or higher)
- npm

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

## Development

To start the local server:

```bash
npm run dev
```

The server will start on `http://localhost:3000/sse`.

## How to Debug Locally

You can debug your app locally using the [MCP Inspector](https://github.com/modelcontextprotocol/inspector).

1. Ensure your server is running (`npm run dev`).
2. Open a new terminal window.
3. Run the Inspector connecting to your local server:

   ```bash
   npx @modelcontextprotocol/inspector --transport sse --server-url http://localhost:3000/sse
   ```

4. The Inspector will open in your browser (usually at `http://localhost:5173`).
5. You can see the list of tools (e.g., `calculate_sum`) and execute them to test your logic.

## Project Structure

- `src/index.ts`: Main server file defining tools and starting the Express server with SSE support.
- `package.json`: Project configuration and scripts.

## Deploying to ChatGPT

To test this in ChatGPT:
1. You need to expose your local server to the internet (e.g., using `ngrok` or `cloudflare tunnel`).
2. Update the URL in your ChatGPT "My Apps" configuration to point to your public URL.
