import type { FiatService } from "../services/fiat-service.js";
import { BaseExchange } from "./base-exchange.js";

export class FiatExchange extends BaseExchange {
	protected name = "Fiat";

	protected getWebSocketURL(symbols: string[]): string {
		return "";
	}

	protected handleMessage(data: any): void {}

	override async fetchPricesRest(symbols: string[], fiatService: FiatService) {
		symbols.forEach((symbol) => {
			this.updatePrice({
				symbol,
				price: fiatService.getRate(symbol, "USD"),
				currency: "USD",
				timestamp: Date.now(),
			});
		});
	}
}
