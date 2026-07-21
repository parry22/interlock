// Shared enums + error code namespaces used across the weaveos package.
//
// Move does not let constants cross module boundaries directly, so each
// "enum" is exposed via a `public fun`. This is the conventional Sui Move
// pattern.
//
// Error code namespace:
//   Each module owns a 10_000-sized range so codes never collide.
//   1 = registry, 2 = quote, 3 = escrow, 4 = workflow,
//   5 = execution, 6 = outcome, 7 = attestation, 8 = settlement
module weaveos::types;

// === Workflow.status (u8) ===
const STATUS_QUOTED: u8 = 0;
const STATUS_EXECUTING: u8 = 1;
const STATUS_VERIFIED: u8 = 2;
const STATUS_SETTLED: u8 = 3;
const STATUS_DISPUTED: u8 = 4;
const STATUS_REFUNDED: u8 = 5;

public fun status_quoted(): u8 { STATUS_QUOTED }
public fun status_executing(): u8 { STATUS_EXECUTING }
public fun status_verified(): u8 { STATUS_VERIFIED }
public fun status_settled(): u8 { STATUS_SETTLED }
public fun status_disputed(): u8 { STATUS_DISPUTED }
public fun status_refunded(): u8 { STATUS_REFUNDED }

// === Split.role (u8) ===
const ROLE_AGENT_COMPANY: u8 = 0;
const ROLE_MODEL_PROVIDER: u8 = 1;
const ROLE_TOOL: u8 = 2;
const ROLE_HUMAN: u8 = 3;
const ROLE_PLATFORM: u8 = 4;

public fun role_agent_company(): u8 { ROLE_AGENT_COMPANY }
public fun role_model_provider(): u8 { ROLE_MODEL_PROVIDER }
public fun role_tool(): u8 { ROLE_TOOL }
public fun role_human(): u8 { ROLE_HUMAN }
public fun role_platform(): u8 { ROLE_PLATFORM }

// === CostItem.category (u8) ===
const CATEGORY_MODEL: u8 = 0;
const CATEGORY_TOOL: u8 = 1;
const CATEGORY_HUMAN: u8 = 2;
const CATEGORY_COMPUTE: u8 = 3;

public fun category_model(): u8 { CATEGORY_MODEL }
public fun category_tool(): u8 { CATEGORY_TOOL }
public fun category_human(): u8 { CATEGORY_HUMAN }
public fun category_compute(): u8 { CATEGORY_COMPUTE }

// === Quote.pricing_model (u8) ===
const PRICING_FIXED: u8 = 0;
const PRICING_CAPPED: u8 = 1;
const PRICING_SUCCESS_FEE: u8 = 2;
const PRICING_HYBRID: u8 = 3;

public fun pricing_fixed(): u8 { PRICING_FIXED }
public fun pricing_capped(): u8 { PRICING_CAPPED }
public fun pricing_success_fee(): u8 { PRICING_SUCCESS_FEE }
public fun pricing_hybrid(): u8 { PRICING_HYBRID }

// === Product.failure_policy (u8) ===
// MVP only supports FAILURE_FULL_REFUND. Others are reserved for Phase 2.
const FAILURE_FULL_REFUND: u8 = 0;
const FAILURE_COST_RECOVERY: u8 = 1;
const FAILURE_PARTIAL: u8 = 2;

public fun failure_full_refund(): u8 { FAILURE_FULL_REFUND }
public fun failure_cost_recovery(): u8 { FAILURE_COST_RECOVERY }
public fun failure_partial(): u8 { FAILURE_PARTIAL }

// === Validators ===
public fun is_valid_status(s: u8): bool { s <= STATUS_REFUNDED }
public fun is_valid_role(r: u8): bool { r <= ROLE_PLATFORM }
public fun is_valid_category(c: u8): bool { c <= CATEGORY_COMPUTE }
public fun is_valid_pricing_model(p: u8): bool { p <= PRICING_HYBRID }
public fun is_valid_failure_policy(f: u8): bool { f <= FAILURE_PARTIAL }
