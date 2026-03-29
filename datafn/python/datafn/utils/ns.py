def ns(*segments: str) -> str:
    if not segments:
        raise ValueError("ns() requires at least one segment")
    filtered = [s for s in segments if s]
    if not filtered:
        raise ValueError("ns() requires at least one non-empty segment")
    return ":".join(filtered)
