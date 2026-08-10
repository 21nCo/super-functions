"""Typed request, response, and envelope models for the Python billfn SDK."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Any, Callable, Dict, Generic, List, Mapping, Optional, TypeVar

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from .errors import BillFnApiError, BillFnCanonicalError

T = TypeVar("T")


class BillFnModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True, use_enum_values=True)


class BillingProviderName(str, Enum):
    DODO = "dodo"
    APPLE = "apple"
    STRIPE = "stripe"
    POLAR = "polar"
    GOOGLE_PLAY = "google-play"
    MICROSOFT_STORE = "microsoft-store"


class BillingOwnerType(str, Enum):
    USER = "user"
    ORGANIZATION = "organization"


class BillingPriceKind(str, Enum):
    SUBSCRIPTION = "subscription"
    ONE_TIME = "one_time"


class BillingInterval(str, Enum):
    MONTH = "month"
    YEAR = "year"
    LIFETIME = "lifetime"


class SubscriptionStatus(str, Enum):
    PENDING = "pending"
    TRIALING = "trialing"
    ACTIVE = "active"
    GRACE = "grace"
    PAST_DUE = "past_due"
    CANCELED = "canceled"
    EXPIRED = "expired"
    PAUSED = "paused"
    FAILED = "failed"


class EntitlementStatus(str, Enum):
    TRIALING = "trialing"
    ACTIVE = "active"
    GRACE = "grace"
    INACTIVE = "inactive"


class CheckoutSessionStatus(str, Enum):
    PENDING = "pending"
    REQUIRES_ACTION = "requires_action"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    EXPIRED = "expired"


class BillableSubject(BillFnModel):
    actor_id: Optional[str] = Field(default=None, alias="actorId")
    actor_type: Optional[str] = Field(default=None, alias="actorType")
    principal_id: Optional[str] = Field(default=None, alias="principalId")
    tenant_id: Optional[str] = Field(default=None, alias="tenantId")
    organization_id: Optional[str] = Field(default=None, alias="organizationId")


class BillFnClientAction(BillFnModel):
    type: str
    url: Optional[str] = None
    product_id: Optional[str] = Field(default=None, alias="productId")
    metadata: Optional[Dict[str, Any]] = None


class BillFnPriceDefinition(BillFnModel):
    price_id: str = Field(alias="priceId")
    provider: str
    provider_product_id: str = Field(alias="providerProductId")
    display_name: Optional[str] = Field(default=None, alias="displayName")
    currency: str
    amount: float
    kind: str
    interval: str
    trial_days: Optional[int] = Field(default=None, alias="trialDays")
    metadata: Optional[Dict[str, Any]] = None


class BillFnPlanDefinition(BillFnModel):
    product_key: str = Field(alias="productKey")
    plan_key: str = Field(alias="planKey")
    display_name: str = Field(alias="displayName")
    description: Optional[str] = None
    features: Dict[str, bool]
    limits: Dict[str, int]
    metadata: Optional[Dict[str, Any]] = None
    prices: List[BillFnPriceDefinition]


class BillFnCatalog(BillFnModel):
    plans: List[BillFnPlanDefinition]


class BillFnBillingAccount(BillFnModel):
    id: str
    owner_type: str = Field(alias="ownerType")
    owner_id: str = Field(alias="ownerId")
    currency: Optional[str] = None
    region: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
    created_at: str = Field(alias="createdAt")
    updated_at: str = Field(alias="updatedAt")


class BillFnCheckoutSession(BillFnModel):
    checkout_session_id: str = Field(alias="checkoutSessionId")
    billing_account_id: str = Field(alias="billingAccountId")
    plan_key: str = Field(alias="planKey")
    price_id: str = Field(alias="priceId")
    provider: str
    provider_checkout_id: Optional[str] = Field(default=None, alias="providerCheckoutId")
    provider_subscription_id: Optional[str] = Field(default=None, alias="providerSubscriptionId")
    provider_charge_id: Optional[str] = Field(default=None, alias="providerChargeId")
    status: str
    checkout_url: Optional[str] = Field(default=None, alias="checkoutUrl")
    client_action: Optional[BillFnClientAction] = Field(default=None, alias="clientAction")
    metadata: Optional[Dict[str, Any]] = None
    created_at: str = Field(alias="createdAt")
    updated_at: str = Field(alias="updatedAt")


class BillFnSubscription(BillFnModel):
    id: str
    billing_account_id: str = Field(alias="billingAccountId")
    plan_key: str = Field(alias="planKey")
    price_id: str = Field(alias="priceId")
    provider: str
    provider_subscription_id: Optional[str] = Field(default=None, alias="providerSubscriptionId")
    provider_checkout_id: Optional[str] = Field(default=None, alias="providerCheckoutId")
    provider_charge_id: Optional[str] = Field(default=None, alias="providerChargeId")
    status: str
    current_period_start: Optional[str] = Field(default=None, alias="currentPeriodStart")
    current_period_end: Optional[str] = Field(default=None, alias="currentPeriodEnd")
    cancel_at: Optional[str] = Field(default=None, alias="cancelAt")
    canceled_at: Optional[str] = Field(default=None, alias="canceledAt")
    trial_end: Optional[str] = Field(default=None, alias="trialEnd")
    auto_renew: bool = Field(alias="autoRenew")
    metadata: Optional[Dict[str, Any]] = None
    created_at: str = Field(alias="createdAt")
    updated_at: str = Field(alias="updatedAt")


class BillFnEntitlementSnapshot(BillFnModel):
    id: str
    billing_account_id: str = Field(alias="billingAccountId")
    plan_key: str = Field(alias="planKey")
    status: str
    features: Dict[str, bool]
    limits: Dict[str, int]
    effective_at: str = Field(alias="effectiveAt")
    expires_at: Optional[str] = Field(default=None, alias="expiresAt")
    source_event_id: Optional[str] = Field(default=None, alias="sourceEventId")
    created_at: str = Field(alias="createdAt")
    updated_at: str = Field(alias="updatedAt")


class BillFnCheckoutCreateRequest(BillFnModel):
    subject: Optional[BillableSubject] = None
    plan_key: str = Field(alias="planKey")
    provider: str
    interval: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
    customer: Optional[Dict[str, Any]] = None
    return_url: Optional[str] = Field(default=None, alias="returnUrl")
    success_url: Optional[str] = Field(default=None, alias="successUrl")
    cancel_url: Optional[str] = Field(default=None, alias="cancelUrl")


class BillFnCheckoutVerifyRequest(BillFnModel):
    subject: Optional[BillableSubject] = None
    checkout_session_id: str = Field(alias="checkoutSessionId")
    payload: Optional[Dict[str, Any]] = None


class BillFnCancelSubscriptionRequest(BillFnModel):
    subject: Optional[BillableSubject] = None
    subscription_id: Optional[str] = Field(default=None, alias="subscriptionId")
    reason: Optional[str] = None


class BillFnSyncSubscriptionRequest(BillFnModel):
    subject: Optional[BillableSubject] = None
    subscription_id: Optional[str] = Field(default=None, alias="subscriptionId")


class BillFnRestorePurchasesRequest(BillFnModel):
    subject: Optional[BillableSubject] = None
    plan_key: str = Field(alias="planKey")
    provider: str
    price_id: Optional[str] = Field(default=None, alias="priceId")
    purchase_reference: str = Field(alias="purchaseReference")
    payload: Optional[Dict[str, Any]] = None


class BillFnCreateCheckoutResponseData(BillFnModel):
    checkout_session: BillFnCheckoutSession = Field(alias="checkoutSession")
    billing_account: BillFnBillingAccount = Field(alias="billingAccount")
    plan: Dict[str, Any]


class BillFnVerifyCheckoutResponseData(BillFnModel):
    checkout_session: BillFnCheckoutSession = Field(alias="checkoutSession")
    subscription: BillFnSubscription
    entitlements: BillFnEntitlementSnapshot


class BillFnCancelSubscriptionResponseData(BillFnModel):
    subscription: BillFnSubscription
    entitlements: BillFnEntitlementSnapshot


class BillFnSyncSubscriptionResponseData(BillFnModel):
    subscription: BillFnSubscription
    entitlements: BillFnEntitlementSnapshot


class BillFnRestorePurchasesResponseData(BillFnModel):
    subscription: BillFnSubscription
    entitlements: BillFnEntitlementSnapshot


class BillFnEntitlementsResponseData(BillFnModel):
    billing_account: BillFnBillingAccount = Field(alias="billingAccount")
    entitlements: Optional[BillFnEntitlementSnapshot] = None
    subscription: Optional[BillFnSubscription] = None


class BillFnUsageItem(BillFnModel):
    resource: str
    current: int
    limit: int


class BillFnUsageResponseData(BillFnModel):
    billing_account: BillFnBillingAccount = Field(alias="billingAccount")
    usage: List[BillFnUsageItem]


class BillFnEnvelopeMeta(BillFnModel):
    timestamp: Optional[str] = None


@dataclass(slots=True)
class BillFnEnvelope(Generic[T]):
    ok: bool
    data: Optional[T] = None
    error: Optional[BillFnCanonicalError] = None
    meta: Optional[BillFnEnvelopeMeta] = None

    def unwrap(self) -> T:
        if not self.ok or self.data is None:
            if self.error is not None:
                raise BillFnApiError(self.error)
            raise BillFnApiError(
                BillFnCanonicalError(
                    code="BILLFN_INVALID_ENVELOPE",
                    message="billfn returned an invalid envelope",
                    status=500,
                    retryable=False,
                )
            )
        return self.data

    @classmethod
    def from_dict(
        cls,
        payload: Mapping[str, Any],
        parser: Callable[[Mapping[str, Any]], T],
    ) -> "BillFnEnvelope[T]":
        ok = bool(payload.get("ok"))
        meta_payload = payload.get("meta")
        meta = BillFnEnvelopeMeta.model_validate(meta_payload) if isinstance(meta_payload, Mapping) else None

        if ok:
            data_payload = payload.get("data")
            if not isinstance(data_payload, Mapping):
                return cls(
                    ok=False,
                    error=BillFnCanonicalError(
                        code="BILLFN_INVALID_ENVELOPE",
                        message="billfn success envelope did not contain an object data payload",
                        status=500,
                        retryable=False,
                    ),
                    meta=meta,
                )
            try:
                return cls(ok=True, data=parser(data_payload), meta=meta)
            except ValidationError as validation_error:
                return cls(
                    ok=False,
                    error=BillFnCanonicalError(
                        code="BILLFN_INVALID_ENVELOPE",
                        message="billfn success envelope did not match the expected schema",
                        status=500,
                        retryable=False,
                        details={"errors": validation_error.errors()},
                    ),
                    meta=meta,
                )

        error_payload = payload.get("error")
        if isinstance(error_payload, Mapping):
            parsed_error = BillFnCanonicalError(
                code=str(error_payload.get("code", "BILLFN_UNKNOWN_ERROR")),
                message=str(error_payload.get("message", "billfn request failed")),
                status=int(error_payload.get("status", 500)),
                retryable=bool(error_payload.get("retryable", False)),
                details=dict(error_payload.get("details", {})) if isinstance(error_payload.get("details"), Mapping) else None,
            )
        else:
            parsed_error = BillFnCanonicalError(
                code="BILLFN_INVALID_ENVELOPE",
                message="billfn error envelope did not contain an error payload",
                status=500,
                retryable=False,
            )
        return cls(ok=False, error=parsed_error, meta=meta)
