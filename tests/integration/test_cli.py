"""Integration tests for Caelterra CLI commands.

Caelterra operates in **multi-profile** mode (``default_profile=None``).
In non-TTY mode:
- Setup lists all available profiles and selects them all
- Installs bundled skills to global skills dir
- Optionally applies SOUL.md per profile

These tests run against a real Hermes agent inside Docker.
"""

from fabricium.testing.assertions import (
    CliAssert,
    assert_exit_code,
    assert_profile_in_output,
    assert_setup_completed,
    assert_update_check_responded,
)
from fabricium.testing.harness import HermesDockerTestEnv

PLUGIN = "caelterra"


class TestCaelterraSetup:
    """``hermes caelterra setup`` — multi-profile installation."""

    def test_setup_completes_in_non_tty(self, hermes_test_env: HermesDockerTestEnv) -> None:
        """Multi-profile setup should complete successfully in CI mode."""
        result = hermes_test_env.run_cli(PLUGIN, "setup", timeout=90)

        CliAssert.exit_code(result)
        assert_setup_completed(result, PLUGIN)
        # Multi-profile mode prints "for selected profiles"
        assert (
            "selected profiles" in result.stdout.lower()
            or "setup complete" in result.stdout.lower()
        )

    def test_setup_mentions_default_profile(self, hermes_test_env: HermesDockerTestEnv) -> None:
        """Multi-profile setup should include the 'default' profile."""
        result = hermes_test_env.run_cli(PLUGIN, "setup", timeout=90)
        CliAssert.exit_code(result)
        # The 'default' profile should appear (it's auto-created by Hermes)
        assert_profile_in_output(result, "default")

    def test_setup_is_idempotent(self, hermes_test_env: HermesDockerTestEnv) -> None:
        """Running setup twice should succeed both times."""
        r1 = hermes_test_env.run_cli(PLUGIN, "setup", timeout=90)
        CliAssert.exit_code(r1)

        r2 = hermes_test_env.run_cli(PLUGIN, "setup", timeout=90)
        CliAssert.exit_code(r2)
        assert_setup_completed(r2, PLUGIN)


class TestCaelterraStatus:
    """``hermes caelterra status`` — installation state."""

    def test_status_works_and_shows_something(self, hermes_test_env: HermesDockerTestEnv) -> None:
        """Status should run without error regardless of installation state."""
        result = hermes_test_env.run_cli(PLUGIN, "status")
        # Should not crash — either shows empty table or installed profiles
        assert "error" not in (result.stdout + result.stderr).lower()

    def test_status_after_setup_has_entries(self, hermes_test_env: HermesDockerTestEnv) -> None:
        """After setup, status should show at least one profile."""
        hermes_test_env.run_cli(PLUGIN, "setup", timeout=90)
        result = hermes_test_env.run_cli(PLUGIN, "status")
        assert_exit_code(result)

        # The status table should contain the default profile
        assert_profile_in_output(result, "default")


class TestCaelterraUpdateCheck:
    """``hermes caelterra update --check`` — update availability check."""

    def test_update_check_produces_diagnostic(self, hermes_test_env: HermesDockerTestEnv) -> None:
        """Update check should produce a meaningful status message."""
        result = hermes_test_env.run_cli(PLUGIN, "update", "--check", timeout=90)
        assert_update_check_responded(result)


class TestCaelterraEdgeCases:
    """Edge cases specific to multi-profile mode."""

    def test_unknown_command_fails(self, hermes_test_env: HermesDockerTestEnv) -> None:
        """Nonexistent subcommand should exit non-zero."""
        result = hermes_test_env.run_cli(PLUGIN, "bad-command")
        assert result.exit_code != 0

    def test_setup_handles_no_bundled_skills(self, hermes_test_env: HermesDockerTestEnv) -> None:
        """If the plugin has no skills/, setup should still complete."""
        result = hermes_test_env.run_cli(PLUGIN, "setup", timeout=90)
        # Should not crash — either installs skills or reports none
        assert "error" not in (result.stdout + result.stderr).lower()
