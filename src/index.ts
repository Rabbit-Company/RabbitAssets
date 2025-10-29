import { Web } from "@rabbit-company/web";
import { Config } from "./config";
import { Logger } from "./logger";
import { MetricsExporter } from "./metrics";
import { MonitorManager } from "./monitor-manager";

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

app.get("/metrics", async (ctx) => {
	const metrics = monitorManager.getAssetMetrics();
	return ctx.text(MetricsExporter.generateOpenMetrics(metrics));
});

app.listen({
	hostname: cfg.server?.host || "0.0.0.0",
	port: cfg.server?.port || 3000,
});
