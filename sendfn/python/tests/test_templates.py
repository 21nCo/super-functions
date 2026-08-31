"""Template engine regression tests."""

import pytest

from sendfn.email.templates import TemplateEngine
from sendfn.errors import TemplateError


def test_template_engine_renders_variables_conditionals_and_loops() -> None:
    engine = TemplateEngine()

    rendered = engine.render(
        '<ul>{{#each items}}<li>{{name}}</li>{{/each}}</ul>{{#if cta}}<a href="{{cta}}">Go</a>{{/if}}',
        {
            "items": [{"name": "<Alice>"}, {"name": "Bob"}],
            "cta": "https://example.com",
        },
    )

    assert (
        rendered
        == '<ul><li>&lt;Alice&gt;</li><li>Bob</li></ul><a href="https://example.com">Go</a>'
    )


def test_template_engine_leaves_subject_and_text_variables_unescaped_when_requested() -> None:
    engine = TemplateEngine()
    data = {"name": "A&B", "url": "https://example.com/reset?a=1&b=2"}

    assert (
        engine.render("{{name}}: {{url}}", data, escape_html=False)
        == "A&B: https://example.com/reset?a=1&b=2"
    )
    assert engine.render('<a href="{{url}}">{{name}}</a>', data) == (
        '<a href="https://example.com/reset?a=1&amp;b=2">A&amp;B</a>'
    )


def test_template_engine_rejects_malformed_block_syntax() -> None:
    engine = TemplateEngine()

    with pytest.raises(TemplateError) as exc_info:
        engine.render("{{#if missing}}A{{/each}}", {})

    assert exc_info.value.code == "SENDFN_TEMPLATE_RENDER_ERROR"
    assert str(exc_info.value) == "Malformed template block syntax"
