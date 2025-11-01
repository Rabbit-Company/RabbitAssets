import { Logger } from "../logger.js";
import { BaseExchange } from "./base-exchange.js";

export class RabbitStocksExchange extends BaseExchange {
	protected name = "RabbitStocks";

	protected getWebSocketURL(symbols: string[]): string {
		return `wss://stocks.rabbitmonitor.com/ws`;
	}

	override async sendSubscriptionMessage(symbols: string[]): Promise<void> {
		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
			throw new Error("WebSocket is not connected");
		}

		const subscriptionMessage = {
			action: "subscribe",
			symbols: symbols,
		};

		this.ws.send(JSON.stringify(subscriptionMessage));
		Logger.debug(`[${this.name}] Sent subscription for symbols: ${symbols.join(", ")}`);
	}

	protected handleMessage(data: any): void {
		if (data?.event !== "update") return;
		if (!data?.data?.price) return;

		let price = data.data.price;
		let currency = data.data.currency;

		// GBX to GBP conversion
		if (currency === "GBX") {
			price /= 100;
			currency = "GBP";
		}

		this.updatePrice({
			symbol: data.symbol,
			price,
			currency,
			timestamp: data.data.updated,
		});
	}
}
