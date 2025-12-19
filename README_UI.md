# ChatGPT App UI Integration

You have added a custom UI for your MCP server.

## Components
1. **Frontend (`public/index.html`)**: A simple calculator interface.
2. **Backend API (`src/index.ts`)**:
   - Serves static files from `public/`.
   - Provides `POST /calculate` endpoint for the UI to call.

## How to Use in ChatGPT

To use this UI within ChatGPT (as a ChatGPT App):

1. **Deploy**: Ensure your server is running and accessible (e.g., via ngrok or a public URL).
2. **Configure ChatGPT App**:
   - Go to [ChatGPT Builder / My Apps](https://chatgpt.com/gpts/editor).
   - Create a new App or Edit an existing one.
   - In the configuration, you may need to specify the **Authentication** or **Actions**.
   - **Important**: For the "Custom UI" (Canvas/Apps SDK) feature, you typically configure the App to load your web page (e.g., `https://your-domain.com/`) in the iframe or "Main View".
   - The UI communicates with ChatGPT via `window.openai` (if using the full SDK) or simply acts as a web view that calls your backend.

## Local Testing
1. Run `npm run dev`.
2. Open `http://localhost:3000` in your browser to test the UI standalone.

