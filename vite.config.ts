import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    server: {
      host: "::",
      port: 8081,
      hmr: { overlay: false },

    },
    plugins: [
      react(),
      mode === "development" && componentTagger(),
      {
        name: 'local-email-middleware',
        configureServer: (server: any) => {
          server.middlewares.use(async (req: any, res: any, next: any) => {
            if (req.url?.startsWith("/api/send-email") && req.method === "POST") {
              let body = "";
              req.on("data", (chunk: any) => { body += chunk.toString(); });
              req.on("end", async () => {
                try {
                  const { to, subject, html } = JSON.parse(body);
                  const apiKey = env.VITE_RESEND_API_KEY;

                  console.log("\n[EMAIL] /api/send-email called");
                  console.log("[EMAIL] To:", to);
                  console.log("[EMAIL] Subject:", subject);
                  console.log("[EMAIL] API Key present:", !!apiKey, apiKey ? `(${apiKey.slice(0,8)}...)` : "MISSING");

                  if (!apiKey) {
                    console.error("[EMAIL] ERROR: VITE_RESEND_API_KEY missing in .env");
                    res.statusCode = 500;
                    res.setHeader("Content-Type", "application/json");
                    res.end(JSON.stringify({ error: "VITE_RESEND_API_KEY is missing in .env" }));
                    return;
                  }

                  const response = await fetch("https://api.resend.com/emails", {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      Authorization: `Bearer ${apiKey}`,
                    },
                    body: JSON.stringify({
                      from: "Edullent <invite@edulent.dgion.com>",
                      to: Array.isArray(to) ? to : [to],
                      subject,
                      html,
                    }),
                  });

                  const result = await response.json();
                  console.log("[EMAIL] Resend response status:", response.status);
                  console.log("[EMAIL] Resend response:", JSON.stringify(result));

                  res.setHeader("Content-Type", "application/json");
                  res.statusCode = response.status || 200;
                  res.end(JSON.stringify(result));
                } catch (err: any) {
                  console.error("[EMAIL] Middleware error:", err.message);
                  res.statusCode = 500;
                  res.setHeader("Content-Type", "application/json");
                  res.end(JSON.stringify({ error: err.message }));
                }
              });
            } else {
              next();
            }
          });
        }
      }
    ].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
