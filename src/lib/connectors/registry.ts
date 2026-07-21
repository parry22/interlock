// Connector registry — the single place core logic resolves a provider by slug.
//
// Adding a connector (Salesforce, HubSpot, a legal or healthcare system, ...) is
// a new file in providers/ plus one line here. No core route, ingest, or
// reversal code changes — that's the whole point of the abstraction.

import type { Connector } from "./types";
import { mockConnector } from "./providers/mock";
import { serviceTitanConnector } from "./providers/servicetitan";
import { housecallProConnector } from "./providers/housecallpro";
import { greenhouseConnector } from "./providers/greenhouse";
import { leverConnector } from "./providers/lever";
import { bambooHrConnector } from "./providers/bamboohr";

const CONNECTORS: Connector[] = [
  mockConnector,
  serviceTitanConnector,
  housecallProConnector,
  greenhouseConnector,
  leverConnector,
  bambooHrConnector,
];

const REGISTRY: Map<string, Connector> = new Map(CONNECTORS.map((c) => [c.sourceSystem, c]));

export function getConnector(sourceSystem: string): Connector | undefined {
  return REGISTRY.get(sourceSystem);
}

export function requireConnector(sourceSystem: string): Connector {
  const c = REGISTRY.get(sourceSystem);
  if (!c) throw new Error(`no connector registered for "${sourceSystem}"`);
  return c;
}

export function listConnectors(): Connector[] {
  return [...REGISTRY.values()];
}

export function isKnownConnector(sourceSystem: string): boolean {
  return REGISTRY.has(sourceSystem);
}
