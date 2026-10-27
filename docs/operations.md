# Operations

Run commands from the checkout directory using the same Compose project name
as the installation. Keep one app replica bound to `127.0.0.1:3000`.
See the [README](../README.md) for initial setup and token permissions.

## Health and Troubleshooting

```sh
docker compose ps
docker compose logs --tail=100 app
curl --fail http://localhost:3000/api/health
```

Health reports local storage readiness and integration configuration separately.
`ready: true` does not certify upstream authentication, model access, or quota.
Check the dashboard for integration errors and stale timestamps. Sync failures
retain the last successfully cached data; local todos remain available.

- **Azure DevOps:** check PAT expiry, organization, selected project/repository
  scopes, and read permissions. Missing Graph access degrades review requests.
- **Copilot:** check token type, Copilot Requests permission, model access, usage,
  and organization policies. Host VS Code/CLI credentials are not used.
- **Configuration changes:** run `docker compose up -d --force-recreate --wait`.
  A restart alone does not reload the Compose environment.
- **Incomplete chat cleanup:** use Clear to retry. New runs remain blocked until
  cleanup completes; todos are not deleted.

Do not share `.env`, resolved Compose configuration, database files, SDK state,
or backup archives. Review logs before sharing them.

## Backup and Restore

The `devdesk-data` volume contains SQLite, journal files, and SDK context. Stop
the app and copy the **entire volume**, not only an open database file.

```sh
backup="$HOME/devdesk-backup-$(date -u +%Y%m%dT%H%M%SZ).tgz"
umask 077
docker compose stop app &&
docker compose run --rm --no-deps --entrypoint tar app -C /data -czf - . > "$backup" &&
docker compose run --rm --no-deps --entrypoint tar -T app -tzf - < "$backup" > /dev/null &&
docker compose up -d --wait &&
printf 'Backup: %s\n' "$backup"
```

Protect the archive as sensitive local content and store it outside the checkout.
Back up `.env` separately using your own secure secret storage. If a backup or
archive check fails, the command chain leaves the app stopped; investigate before
restarting it with `docker compose up -d --wait`.

To restore to a **fresh, empty** Compose data volume:

```sh
docker compose build &&
docker compose run --rm --no-deps --entrypoint tar -T app -C /data -xzf - < "$backup" &&
docker compose up -d --wait
```

Stop and separately back up any existing installation first. Do not extract into
a non-empty live volume: old WAL/SDK files can invalidate the restored state.
Set `backup` to the archive path if using a new shell. Restore with the same app
version first, then upgrade normally. Check todos, stored chat, and, with a valid
token, conversation continuation after restore.

App data and backups rely on host permissions, not application-level encryption.
Do not use `docker compose down -v` for a restart or upgrade: it removes the data
volume.

## Upgrade and Rollback

Back up first, update the checkout, then run:

```sh
docker compose up -d --build --wait
```

Migrations run at server startup. A migration or storage failure blocks writable
startup rather than replacing the database. For rollback, use the pre-upgrade
backup and matching old image; automatic schema downgrades are not implemented.

## Publishing Source

- Never force-add ignored credentials, databases, SDK state, logs, test outputs,
  or backup archives. Directory uploads can include ignored files.
- Review workspace-specific configuration defaults and provider identifiers for
  organizational approval before sharing. They are not credentials, but may be
  internal information.
- Review every published branch, tag, and its history, including author emails.
  Editing current files does not remove information from earlier commits.
- Use synthetic data for screenshots and examples, not live workspace content.
- Publishing source does not make the app safe for public hosting: it has no
  multi-user authentication.
