# Cloud disaster recovery

Define recovery time and recovery point targets with the operator before production. Back up the platform database and each business database separately, with encrypted storage, least-privilege access, retention and an independent recovery key. Track the tenant identity, snapshot time, schema version, integrity evidence and applicable object references. Confirm whether the selected managed provider supplies point-in-time recovery.

Restore into isolated databases and private object storage. Verify that the restored data belongs to the authorized tenant, then reconcile balances and inventory and verify representative invoice files. Record the elapsed time and any losses and keep the source snapshot intact. Promote a restore only after authorized review and a cutover plan. Cloud backup scheduling and restore rehearsal remain open.

The local encrypted backup publishes the completed archive using a hard link in the destination directory. Use a filesystem with hard-link support, such as NTFS or ext4. For removable media that lacks hard-link support, create and verify the archive on a supported filesystem before copying it to the media.
