"""Sync and async HTTP clients for the Python billfn SDK."""

from __future__ import annotations

from typing import Any, Callable, Mapping, Optional, TypeVar

import httpx

from .errors import BillFnTransportError
from .types import (
    BillableSubject,
    BillFnCancelSubscriptionRequest,
    BillFnCancelSubscriptionResponseData,
    BillFnCatalog,
    BillFnCheckoutCreateRequest,
    BillFnCheckoutVerifyRequest,
    BillFnCreateCheckoutResponseData,
    BillFnEntitlementsResponseData,
    BillFnEnvelope,
    BillFnRestorePurchasesRequest,
    BillFnRestorePurchasesResponseData,
    BillFnSyncSubscriptionRequest,
    BillFnSyncSubscriptionResponseData,
    BillFnUsageResponseData,
    BillFnVerifyCheckoutResponseData,
)

T = TypeVar("T")
DEFAULT_BASE_URL = "http://localhost:3000/billfn"


def _normalize_base_url(base_url: str) -> str:
    return base_url.rstrip("/")


def _as_payload(value: Any) -> dict[str, Any]:
    if hasattr(value, "model_dump"):
        payload = value.model_dump(by_alias=True, exclude_none=True)
        if isinstance(payload, Mapping):
            return {str(key): item for key, item in payload.items()}
        raise TypeError("billfn model payloads must serialize to a mapping")
    if isinstance(value, Mapping):
        return {str(key): item for key, item in value.items()}
    raise TypeError("billfn payloads must be mappings or pydantic models")


def _subject_to_query(subject: Optional[BillableSubject]) -> Optional[dict[str, str]]:
    if subject is None:
        return None
    return {
        key: str(value)
        for key, value in subject.model_dump(by_alias=True, exclude_none=True).items()
    }


def _parse_envelope(response: httpx.Response, parser: Callable[[Mapping[str, Any]], T]) -> BillFnEnvelope[T]:
    try:
        payload = response.json()
    except ValueError as error:
        raise BillFnTransportError("billfn returned a non-JSON response", cause=error) from error

    if not isinstance(payload, Mapping):
        raise BillFnTransportError("billfn returned a non-object JSON response")

    return BillFnEnvelope.from_dict(payload, parser)


class BillFnClient:
    """Synchronous billfn HTTP client."""

    def __init__(
        self,
        *,
        base_url: str = DEFAULT_BASE_URL,
        client: Optional[httpx.Client] = None,
        timeout: float = 10.0,
    ) -> None:
        self.base_url = _normalize_base_url(base_url)
        self._client = client or httpx.Client(timeout=timeout)
        self._owns_client = client is None

    def close(self) -> None:
        if self._owns_client:
            self._client.close()

    def __enter__(self) -> "BillFnClient":
        return self

    def __exit__(self, _exc_type: Any, _exc: Any, _tb: Any) -> None:
        self.close()

    def _request(
        self,
        method: str,
        path: str,
        *,
        query: Optional[dict[str, str]] = None,
        json: Optional[dict[str, Any]] = None,
        parser: Callable[[Mapping[str, Any]], T],
    ) -> BillFnEnvelope[T]:
        try:
            response = self._client.request(method, f"{self.base_url}{path}", params=query, json=json)
        except httpx.HTTPError as error:
            raise BillFnTransportError("billfn request failed", cause=error) from error
        return _parse_envelope(response, parser)

    def get_catalog(self) -> BillFnEnvelope[BillFnCatalog]:
        return self._request("GET", "/catalog", parser=BillFnCatalog.model_validate)

    def get_entitlements(
        self,
        subject: Optional[BillableSubject] = None,
    ) -> BillFnEnvelope[BillFnEntitlementsResponseData]:
        return self._request(
            "GET",
            "/entitlements",
            query=_subject_to_query(subject),
            parser=BillFnEntitlementsResponseData.model_validate,
        )

    def get_usage(
        self,
        subject: Optional[BillableSubject] = None,
        *,
        resource: Optional[str] = None,
    ) -> BillFnEnvelope[BillFnUsageResponseData]:
        query = _subject_to_query(subject) or {}
        if resource is not None:
            query["resource"] = resource
        return self._request(
            "GET",
            "/usage",
            query=query or None,
            parser=BillFnUsageResponseData.model_validate,
        )

    def create_checkout(
        self,
        request: BillFnCheckoutCreateRequest | Mapping[str, Any],
    ) -> BillFnEnvelope[BillFnCreateCheckoutResponseData]:
        return self._request(
            "POST",
            "/checkouts",
            json=_as_payload(request),
            parser=BillFnCreateCheckoutResponseData.model_validate,
        )

    def verify_checkout(
        self,
        request: BillFnCheckoutVerifyRequest | Mapping[str, Any],
    ) -> BillFnEnvelope[BillFnVerifyCheckoutResponseData]:
        return self._request(
            "POST",
            "/checkouts/verify",
            json=_as_payload(request),
            parser=BillFnVerifyCheckoutResponseData.model_validate,
        )

    def cancel_subscription(
        self,
        request: BillFnCancelSubscriptionRequest | Mapping[str, Any],
    ) -> BillFnEnvelope[BillFnCancelSubscriptionResponseData]:
        return self._request(
            "POST",
            "/subscriptions/cancel",
            json=_as_payload(request),
            parser=BillFnCancelSubscriptionResponseData.model_validate,
        )

    def sync_subscription(
        self,
        request: BillFnSyncSubscriptionRequest | Mapping[str, Any],
    ) -> BillFnEnvelope[BillFnSyncSubscriptionResponseData]:
        return self._request(
            "POST",
            "/subscriptions/sync",
            json=_as_payload(request),
            parser=BillFnSyncSubscriptionResponseData.model_validate,
        )

    def restore_purchases(
        self,
        request: BillFnRestorePurchasesRequest | Mapping[str, Any],
    ) -> BillFnEnvelope[BillFnRestorePurchasesResponseData]:
        return self._request(
            "POST",
            "/purchases/restore",
            json=_as_payload(request),
            parser=BillFnRestorePurchasesResponseData.model_validate,
        )


class AsyncBillFnClient:
    """Asynchronous billfn HTTP client."""

    def __init__(
        self,
        *,
        base_url: str = DEFAULT_BASE_URL,
        client: Optional[httpx.AsyncClient] = None,
        timeout: float = 10.0,
    ) -> None:
        self.base_url = _normalize_base_url(base_url)
        self._client = client or httpx.AsyncClient(timeout=timeout)
        self._owns_client = client is None

    async def aclose(self) -> None:
        if self._owns_client:
            await self._client.aclose()

    async def __aenter__(self) -> "AsyncBillFnClient":
        return self

    async def __aexit__(self, _exc_type: Any, _exc: Any, _tb: Any) -> None:
        await self.aclose()

    async def _request(
        self,
        method: str,
        path: str,
        *,
        query: Optional[dict[str, str]] = None,
        json: Optional[dict[str, Any]] = None,
        parser: Callable[[Mapping[str, Any]], T],
    ) -> BillFnEnvelope[T]:
        try:
            response = await self._client.request(method, f"{self.base_url}{path}", params=query, json=json)
        except httpx.HTTPError as error:
            raise BillFnTransportError("billfn request failed", cause=error) from error
        return _parse_envelope(response, parser)

    async def get_catalog(self) -> BillFnEnvelope[BillFnCatalog]:
        return await self._request("GET", "/catalog", parser=BillFnCatalog.model_validate)

    async def get_entitlements(
        self,
        subject: Optional[BillableSubject] = None,
    ) -> BillFnEnvelope[BillFnEntitlementsResponseData]:
        return await self._request(
            "GET",
            "/entitlements",
            query=_subject_to_query(subject),
            parser=BillFnEntitlementsResponseData.model_validate,
        )

    async def get_usage(
        self,
        subject: Optional[BillableSubject] = None,
        *,
        resource: Optional[str] = None,
    ) -> BillFnEnvelope[BillFnUsageResponseData]:
        query = _subject_to_query(subject) or {}
        if resource is not None:
            query["resource"] = resource
        return await self._request(
            "GET",
            "/usage",
            query=query or None,
            parser=BillFnUsageResponseData.model_validate,
        )

    async def create_checkout(
        self,
        request: BillFnCheckoutCreateRequest | Mapping[str, Any],
    ) -> BillFnEnvelope[BillFnCreateCheckoutResponseData]:
        return await self._request(
            "POST",
            "/checkouts",
            json=_as_payload(request),
            parser=BillFnCreateCheckoutResponseData.model_validate,
        )

    async def verify_checkout(
        self,
        request: BillFnCheckoutVerifyRequest | Mapping[str, Any],
    ) -> BillFnEnvelope[BillFnVerifyCheckoutResponseData]:
        return await self._request(
            "POST",
            "/checkouts/verify",
            json=_as_payload(request),
            parser=BillFnVerifyCheckoutResponseData.model_validate,
        )

    async def cancel_subscription(
        self,
        request: BillFnCancelSubscriptionRequest | Mapping[str, Any],
    ) -> BillFnEnvelope[BillFnCancelSubscriptionResponseData]:
        return await self._request(
            "POST",
            "/subscriptions/cancel",
            json=_as_payload(request),
            parser=BillFnCancelSubscriptionResponseData.model_validate,
        )

    async def sync_subscription(
        self,
        request: BillFnSyncSubscriptionRequest | Mapping[str, Any],
    ) -> BillFnEnvelope[BillFnSyncSubscriptionResponseData]:
        return await self._request(
            "POST",
            "/subscriptions/sync",
            json=_as_payload(request),
            parser=BillFnSyncSubscriptionResponseData.model_validate,
        )

    async def restore_purchases(
        self,
        request: BillFnRestorePurchasesRequest | Mapping[str, Any],
    ) -> BillFnEnvelope[BillFnRestorePurchasesResponseData]:
        return await self._request(
            "POST",
            "/purchases/restore",
            json=_as_payload(request),
            parser=BillFnRestorePurchasesResponseData.model_validate,
        )
