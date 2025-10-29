import { Logger } from "./logger";
import type { ConfigType } from "./types";

export namespace Config {
	let data: ConfigType;
	let filePath: string;
	let autoSave = false;

	export function getConfigFilePath(): string {
		return Bun.argv[2] || "config.json";
	}

	export async function load(path?: string): Promise<void> {
		filePath = path || getConfigFilePath();

		try {
			data = await Bun.file(filePath).json();
			Logger.info(`Successfully parsed configuration file (${filePath})`);
		} catch (err: any) {
			Logger.error(`Failed to parse configuration file (${filePath})`, err);
			data = {} as ConfigType;
		}
	}

	export function getData(): ConfigType {
		return data;
	}

	export function get<K extends keyof ConfigType>(key: K): ConfigType[K] {
		return data[key];
	}

	/** Get a nested value using dot notation (e.g. "crypto.assets.BTC") */
	export function getPath<T = any>(path: string): T | undefined {
		return path.split(".").reduce((obj: any, key) => obj?.[key], data);
	}

	/** Set a nested value using dot notation (e.g. "crypto.assets.BTC", 0.01) */
	export async function setPath(path: string, value: any): Promise<void> {
		const keys = path.split(".").filter(Boolean);
		if (keys.length === 0) return;

		let obj: any = data;

		for (let i = 0; i < keys.length - 1; i++) {
			const key = keys[i];
			if (!key) continue;
			if (obj[key] === undefined) obj[key] = {};
			obj = obj[key];
		}

		const lastKey = keys[keys.length - 1];
		if (lastKey) obj[lastKey] = value;

		if (autoSave) await save();
	}

	export async function set<K extends keyof ConfigType>(key: K, value: ConfigType[K]): Promise<void> {
		data[key] = value;
		if (autoSave) await save();
	}

	export function setAutoSave(enabled: boolean): void {
		autoSave = enabled;
		Logger.info(`Auto-save is now ${enabled ? "enabled" : "disabled"}`);
	}

	export async function save(path?: string): Promise<void> {
		const target = path || filePath || getConfigFilePath();

		try {
			await Bun.write(target, JSON.stringify(data, null, 2));
			Logger.info(`Configuration saved to ${target}`);
		} catch (err: any) {
			Logger.error(`Failed to save configuration file (${target})`, err);
		}
	}
}
