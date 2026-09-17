import { parseArgs, listFlag } from "../lib/args.mjs";
import {
	resolveMatrix,
	selectTargets,
	themesForTarget,
} from "../lib/matrix.mjs";
import { assertDocker, syncCompose } from "../lib/docker.mjs";
import {
	runSuite,
	resolveEditions,
	printSummary,
	packagesForEdition,
	allPackages,
	SUITES,
} from "../lib/runner.mjs";
import { runE2e } from "../lib/e2e.mjs";
import { log, UserError } from "../lib/log.mjs";

const DEFAULT_SUITES = ["unit", "integration", "e2e"];

export async function run(argv) {
	const { positional, flags } = parseArgs(argv, {
		booleans: ["coverage", "headed", "bail", "no-sweep"],
	});
	await assertDocker();

	const matrix = await resolveMatrix();
	syncCompose(matrix);

	const requested = positional.length ? positional : listFlag(flags.suite);
	const suites = normalizeSuites(requested);
	const targets = selectTargets(matrix, listFlag(flags.targets));
	const editions = resolveEditions(flags.edition);

	if (!editions.length) {
		throw new UserError(
			"No such edition. The available ones come from starter.json and the plugins/ directories.",
		);
	}

	log.step(
		`Suites: ${suites.join(", ")} | targets: ${targets
			.map((t) => t.id)
			.join(", ")} | editions: ${editions.join(", ")}`,
	);

	const rows = [];
	const emit = (text) => process.stdout.write(text);

	for (const suite of suites) {
		// Unit tests and linters never load WordPress, so the edition is irrelevant for them:
		// they run once per PHP version per package instead of once per combination.
		const editionless = [
			"unit",
			"types",
			"lint",
			"analyse",
			"plugin-check",
		].includes(suite);
		const combos = editionless
			? allPackages().map((pkg) => ({ edition: null, pkg }))
			: editions.flatMap((edition) =>
					suite === "e2e"
						? [{ edition, pkg: null }]
						: packagesForEdition(edition).map((pkg) => ({ edition, pkg })),
				);

		for (const target of targets) {
			// e2e is the only suite where the theme matters: it is the only one that renders pages.
			// --no-sweep pins every target to the default theme; CI uses it on pull requests, where
			// one theme run is the difference between quick feedback and a quarter of an hour.
			const themeOverride = listFlag(flags.themes || flags.theme);
			const themes =
				suite === "e2e"
					? themesForTarget(
							matrix,
							target.id,
							themeOverride.length
								? themeOverride
								: flags["no-sweep"]
									? [matrix.themes.default]
									: [],
						)
					: [null];

			for (const { edition, pkg } of combos) {
				for (const theme of themes) {
					const result =
						suite === "e2e"
							? await runE2e({
									matrix,
									target,
									edition,
									theme,
									filter: flags.filter,
									headed: flags.headed,
									onLog: emit,
								})
							: await runSuite({
									matrix,
									target,
									suite,
									edition,
									pkg,
									filter: flags.filter,
									coverage: flags.coverage,
									onLog: emit,
								});

					rows.push({
						label: [target.id, pkg?.key ?? edition, theme?.alias, suite]
							.filter(Boolean)
							.join("-"),
						ok: result.ok,
						file: result.file,
					});

					if (!result.ok && flags.bail) {
						return printSummary(rows);
					}
				}
			}
		}
	}

	return printSummary(rows);
}

function normalizeSuites(requested) {
	if (!requested.length) return DEFAULT_SUITES;

	const out = [];
	for (const name of requested) {
		if (name === "all") {
			out.push(
				"lint",
				"analyse",
				"types",
				"unit",
				"integration",
				"e2e",
				"plugin-check",
			);
			continue;
		}
		if (!SUITES.includes(name)) {
			throw new UserError(
				`Unknown suite "${name}". Available: ${SUITES.join(", ")}, all`,
			);
		}
		out.push(name);
	}
	return [...new Set(out)];
}
