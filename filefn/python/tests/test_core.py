def test_import_sanity_package_exists() -> None:
    import filefn
    from filefn import FileFn, FileFnConfig, create_file_fn

    assert filefn is not None
    assert callable(create_file_fn)
    assert FileFn is not None
    assert FileFnConfig is not None


def test_top_level_exports_documented_server_entrypoints() -> None:
    import filefn
    from filefn.server import FileFn, FileFnConfig, create_file_fn

    assert filefn.create_file_fn is create_file_fn
    assert filefn.FileFnConfig is FileFnConfig
    assert filefn.FileFn is FileFn


def test_processing_package_exports_documented_processor_factories() -> None:
    from filefn import processing

    assert callable(processing.create_thumbnail_processor)
    assert callable(processing.create_compression_processor)
    assert callable(processing.create_ocr_processor)
    assert callable(processing.create_image_transform_processor)
    assert callable(processing.create_video_processor)
    assert callable(processing.create_audio_processor)


def test_filefn_config_exposes_auth_rate_limit_and_dedup_surfaces() -> None:
    from filefn.server import (
        AuthConfig,
        DedupConfig,
        FileFnConfig,
        RateLimitCategoryConfig,
        RateLimitConfig,
        RateLimitLimitsConfig,
    )

    rate_limit = RateLimitConfig(
        persistence=object(),
        limits=RateLimitLimitsConfig(
            upload_init=RateLimitCategoryConfig(window_seconds=60, max_requests=5),
            download=RateLimitCategoryConfig(windowSeconds=30, maxRequests=10),
        ),
    )
    config = FileFnConfig(
        db=object(),
        storage=object(),
        auth=AuthConfig(required=True, allow_anonymous_uploads=False),
        rate_limit=rate_limit,
        dedup=DedupConfig(enabled=True),
    )

    assert config.auth is not None
    assert config.auth.required is True
    assert config.auth.allow_anonymous_uploads is False
    assert config.rate_limit is not None
    assert config.rate_limit.limits.upload_init is not None
    assert config.rate_limit.limits.upload_init.window_seconds == 60
    assert config.rate_limit.limits.download is not None
    assert config.rate_limit.limits.download.max_requests == 10
    assert config.dedup is not None
    assert config.dedup.enabled is True


def test_policy_registry_define_accepts_policy_dicts() -> None:
    from filefn.server.policies import create_policy_registry

    registry = create_policy_registry()
    registry.define("avatars", {"storageTarget": "durable", "visibility": "private"})

    policy = registry.get("avatars")
    assert policy is not None
    assert policy.storageTarget == "durable"
    assert policy.visibility == "private"
