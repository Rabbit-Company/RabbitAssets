import { Web } from "@rabbit-company/web";
import { Config } from "./config";
import { Logger } from "./logger";
import { MetricsExporter } from "./metrics";
import { MonitorManager } from "./monitor-manager";
import { bearerAuth } from "@rabbit-company/web-middleware/bearer-auth";

await Config.load();
Config.setAutoSave(true);

const cfg = Config.getData();

Logger.setLevel(cfg?.logger?.level || 3);

const monitorManager = new MonitorManager();

try {
	await monitorManager.initialize(cfg);
} catch (error: any) {
	Logger.error("Failed to initialize monitor manager:", error);
	process.exit(1);
}

const app = new Web();

app.use(
	bearerAuth({
		skip() {
			return !cfg.server?.token;
		},
		validate(token) {
			return token === cfg.server?.token;
		},
	})
);

app.get("/metrics", async (ctx) => {
	const metrics = monitorManager.getAssetMetrics();
	return ctx.text(MetricsExporter.generateOpenMetrics(metrics), 200, { "Content-Type": "application/openmetrics-text; version=1.0.0; charset=utf-8" });
});

app.get("/v1/assets", async (ctx) => {
	return ctx.json(monitorManager.getAssetMetrics());
});

const server = await app.listen({
	hostname: cfg.server?.host || "0.0.0.0",
	port: cfg.server?.port || 3000,
});
