/**
 * A new connector file's service name follows its file name, `tedge-dot-<file name>`, until the
 * user sets another one. The templates name the service after the protocol, as the packaged
 * example files do (`tedge-dot-opcua` in opcua.toml). A new file that kept that name would share
 * the example's MQTT identity on a gateway that runs both, and the two would keep knocking each
 * other off the broker (thin-edge/tedge-dot#142).
 *
 * Plain TypeScript, without Angular, so it is unit-tested as it is.
 */
import { PROTOCOL_IDS, parseToml, setAt } from '../generated/config-builder';
import { isValidConnectorName, normalizeName } from './naming';
import { writeKeepingLayout } from './toml-write';

/** The service name a connector file `name` gets by default. */
export function serviceNameOf(name: string): string {
  return `tedge-dot-${name}`;
}

/**
 * Whether `name` was set for the user, not by them: missing, a template's `tedge-dot-<protocol>`,
 * or `followed`, the name this rule set last.
 */
export function isAutomaticServiceName(name: unknown, followed?: string): boolean {
  if (name === undefined) {
    return true;
  }
  return typeof name === 'string' && (name === followed || PROTOCOL_IDS.some(p => name === serviceNameOf(p)));
}

/**
 * The text with the service name of `fileName`, when the file name is valid and the current
 * service name is automatic; undefined when nothing changes. Comments and layout stay.
 */
export function followFileName(text: string, fileName: string, followed?: string): { text: string; serviceName: string } | undefined {
  const name = normalizeName(fileName);
  if (!isValidConnectorName(name)) {
    return undefined;
  }
  const serviceName = serviceNameOf(name);
  try {
    const config = parseToml(text);
    const current = config?.connector?.service_name;
    if (!config?.connector || current === serviceName || !isAutomaticServiceName(current, followed)) {
      return undefined;
    }
    const next = writeKeepingLayout(text, setAt(config, '/connector/service_name', serviceName));
    return next === undefined ? undefined : { text: next, serviceName };
  } catch {
    return undefined;
  }
}
