# Upgrading, restoring and rebuilding

## Upgrading to a new version

1. Check and extract the new package anywhere (not inside `/opt/nightshift`):

   ```bash
   sha256sum -c nightshift-<new-version>.tar.gz.sha256
   tar xzf nightshift-<new-version>.tar.gz
   cd nightshift-<new-version>
   ```

2. Run the upgrade from the **new** package:

   ```bash
   sudo ./upgrade.sh                 # installation in /opt/nightshift
   sudo ./upgrade.sh --dir /srv/ns   # other location
   ```

The upgrade:

1. takes a backup (`/opt/nightshift/backups/`);
2. loads the new images;
3. installs the new files: `nightshift.env`, the certificate and your data are kept;
4. restarts on the new version and waits until every service is healthy. Database
   changes are applied automatically at startup.

Users are disconnected for a minute or two while services restart. Alerts your SIEM
raises during that window are not forwarded to Nightshift (Wazuh does not resend
them); they remain available in the SIEM itself. Upgrade in a quiet period.

**If the new version does not start correctly, the upgrade rolls back by itself**: it
puts the previous version's files back, restores the backup taken in step 1 (the new
version may already have changed the database) and starts the previous version. The
command then ends with an error: send its output to BlueSec support.

After a successful upgrade, free the disk space used by old images with
`sudo docker image prune`.

## Restoring a backup

On the same server (replaces all current alerts, settings and accounts):

```bash
sudo /opt/nightshift/restore.sh /opt/nightshift/backups/nightshift-backup-<...>.tar.gz
```

You are asked to type `restore` to confirm (`--yes` skips the question, for scripts).

## Rebuilding a server from a backup

1. On the new server, install the **same version** as the backup (`install.sh`, with
   the same `--url`).
2. Copy the backup to it and restore it with its configuration:

   ```bash
   sudo /opt/nightshift/restore.sh nightshift-backup-<...>.tar.gz --with-config
   ```

`--with-config` also restores `nightshift.env` (including the encryption key of the
stored API keys) and the certificate, so everything works as before. Then upgrade to
a newer version if needed.
