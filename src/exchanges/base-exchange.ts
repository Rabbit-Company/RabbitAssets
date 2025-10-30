import { EventEmitter } from "events";
import { Logger } from "../logger";
import type { PriceData } from "../types";

export abstract class BaseExchange extends EventEmitter {
	protected ws?: WebSocket;
	protected prices: Map<string, PriceData> = new Map();

	private reconnecting = false;
	private lastMessageTime = 0;
	private watchdogInterval?: NodeJS.Timeout;
	private reconnectTimeout?: NodeJS.Timeout;
	private backoff = 1000;
	private readonly MAX_BACKOFF = 30000;
	private currentSymbols: string[] = [];

	protected abstract name: string;
	protected abstract getWebSocketURL(symbols: string[]): string;
	protected abstract handleMessage(data: any): void;

	// ------------------------------------------------------
	// WebSocket lifecycle
	// ------------------------------------------------------
	public async connectWebSocket(symbols: string[]): Promise<void> {
		return new Promise((resolve, reject) => {
			try {
				// Store current symbols for reconnection
				this.currentSymbols = symbols;

				if (this.ws) {
					const state = this.ws.readyState;
					if (state === WebSocket.OPEN || state === WebSocket.CONNECTING) {
						Logger.debug(`[${this.name}] WebSocket already open/connecting (state: ${state})`);
						return resolve();
					}

					// Clean up existing connection
					this.cleanupWebSocket();
				}

				const url = this.getWebSocketURL(symbols);
				Logger.info(`[${this.name}] Connecting to ${url}`);
				this.ws = new WebSocket(url);

				this.ws.onopen = () => {
					Logger.info(`[${this.name}] WebSocket connected`);
					this.lastMessageTime = Date.now();
					this.reconnecting = false;
					this.backoff = 1000; // Reset backoff on successful connection
					this.startWatchdog();
					resolve();
				};

				this.ws.onmessage = (event) => {
					this.lastMessageTime = Date.now();
					try {
						const data = JSON.parse(event.data.toString());
						this.handleMessage(data);
					} catch (err) {
						Logger.error(`[${this.name}] JSON parse error: ${(err as Error).message}`);
					}
				};

				this.ws.onerror = (err) => {
					Logger.error(`[${this.name}] WebSocket error: ${JSON.stringify(err)}`);
					// Don't reject here - let onclose handle reconnection
					// This prevents breaking the reconnection chain
				};

				this.ws.onclose = (event) => {
					Logger.info(`[${this.name}] WebSocket closed: ${event.code} ${event.reason}`);
					this.scheduleReconnect();
				};
			} catch (err) {
				Logger.error(`[${this.name}] Connection error: ${(err as Error).message}`);
				this.scheduleReconnect();
				reject(err);
			}
		});
	}

	public disconnectWebSocket(): void {
		Logger.info(`[${this.name}] Disconnecting WebSocket`);
		this.cleanupWebSocket();
		this.reconnecting = false;
		this.backoff = 1000;
	}

	private cleanupWebSocket(): void {
		if (this.watchdogInterval) {
			clearInterval(this.watchdogInterval);
			this.watchdogInterval = undefined;
		}

		if (this.reconnectTimeout) {
			clearTimeout(this.reconnectTimeout);
			this.reconnectTimeout = undefined;
		}

		if (this.ws) {
			// Remove all listeners to prevent memory leaks
			this.ws.onopen = null;
			this.ws.onmessage = null;
			this.ws.onerror = null;
			this.ws.onclose = null;

			if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
				this.ws.close(1000, "Manual disconnect");
			}
			this.ws = undefined;
		}
	}

	protected scheduleReconnect(): void {
		if (this.reconnecting) {
			Logger.debug(`[${this.name}] Reconnection already in progress`);
			return;
		}

		this.reconnecting = true;
		this.cleanupWebSocket();

		Logger.warn(`[${this.name}] Attempting reconnect in ${this.backoff / 1000}s... (backoff: ${this.backoff}ms)`);

		this.reconnectTimeout = setTimeout(() => {
			Logger.info(`[${this.name}] Executing reconnection attempt`);
			this.reconnecting = false;

			this.connectWebSocket(this.currentSymbols).catch((error) => {
				Logger.error(`[${this.name}] Reconnection failed: ${error.message}`);
				// Even if reconnection fails, schedule another attempt
				this.scheduleReconnect();
			});

			// Increase backoff for next attempt (with maximum)
			this.backoff = Math.min(this.backoff * 2, this.MAX_BACKOFF);
		}, this.backoff);
	}

	private startWatchdog() {
		if (this.watchdogInterval) clearInterval(this.watchdogInterval);

		this.watchdogInterval = setInterval(() => {
			// Only check if we have an active connection
			if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
				return;
			}

			const silence = Date.now() - this.lastMessageTime;
			if (silence > 60000) {
				Logger.warn(`[${this.name}] No messages for ${Math.round(silence / 1000)}s — forcing reconnect`);
				this.scheduleReconnect();
			}
		}, 15000);
	}

	// ------------------------------------------------------
	// REST fallback (optional per exchange)
	// ------------------------------------------------------
	public async fetchPricesRest(symbols: string[]): Promise<void> {
		Logger.warn(`[${this.name}] REST fetch not implemented`);
	}

	// ------------------------------------------------------
	// Utilities
	// ------------------------------------------------------
	protected updatePrice(priceData: PriceData) {
		this.prices.set(priceData.symbol, priceData);
		this.emit("priceUpdate", priceData);
	}

	public getPrice(symbol: string): PriceData | undefined {
		return this.prices.get(symbol);
	}

	public getAllPrices(): PriceData[] {
		return Array.from(this.prices.values());
	}

	public isWebSocketConnected(): boolean {
		return !!this.ws && this.ws.readyState === WebSocket.OPEN;
	}

	public async reconnect(): Promise<void> {
		Logger.info(`[${this.name}] Manual reconnection triggered`);
		this.backoff = 1000;
		this.cleanupWebSocket();
		await this.connectWebSocket(this.currentSymbols);
	}
}
