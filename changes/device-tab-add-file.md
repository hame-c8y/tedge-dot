### Add, create and register files from a gateway's OT connectors tab

The gateway's **OT connectors** tab in Device Management has one **Add connector file** action,
which starts with a choice:

- *From the repository* sends a repository entry, as before.
- *New file* creates a connector file or point library in the editor, then offers to send it to
  the gateway.
- *Already on the gateway* registers a file the gateway already has, now also a point library. It
  says that registering doesn't create or send the file.

The separate **Register a file on the gateway** action is gone. A registered file without a
repository entry can be created from the tab, and a registered file that is missing on the gateway
is pointed out. See [Connector files from Cumulocity](../doc/c8y-connector-files.md#the-ot-connectors-tab).
