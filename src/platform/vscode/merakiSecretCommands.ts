import * as vscode from 'vscode';
import { SecretProvider } from '../../core/secrets';
import { MERAKI_API_KEY_SECRET, validateMerakiConnection } from '../../integrations/meraki';
import { VscodeSecretProvider } from './vscodeSecretProvider';

export const enum MerakiSecretCommand {
  Configure = 'net-commander.configureMerakiApiKey',
  Remove = 'net-commander.removeMerakiApiKey',
  Check = 'net-commander.checkMerakiApiConfiguration',
  Validate = 'net-commander.validateMerakiConnection',
}

export function registerMerakiSecretCommands(context: vscode.ExtensionContext): void {
  const secrets = new VscodeSecretProvider(context.secrets);
  context.subscriptions.push(
    vscode.commands.registerCommand(MerakiSecretCommand.Configure, () => configureMerakiApiKey(secrets)),
    vscode.commands.registerCommand(MerakiSecretCommand.Remove, () => removeMerakiApiKey(secrets)),
    vscode.commands.registerCommand(MerakiSecretCommand.Check, () => checkMerakiApiConfiguration(secrets)),
    vscode.commands.registerCommand(MerakiSecretCommand.Validate, () => validateMerakiConnectionCommand(secrets)),
  );
}

async function configureMerakiApiKey(secrets: SecretProvider): Promise<void> {
  const value = await vscode.window.showInputBox({
    prompt: 'Enter the Meraki Dashboard API key',
    placeHolder: 'Meraki API key',
    password: true,
    ignoreFocusOut: true,
    validateInput: input => input.trim() ? undefined : 'API key cannot be empty',
  });
  if (value === undefined) return;

  const trimmed = value.trim();
  if (!trimmed) {
    await vscode.window.showErrorMessage('Meraki API key cannot be empty');
    return;
  }

  await secrets.setSecret(MERAKI_API_KEY_SECRET, trimmed);
  await vscode.window.showInformationMessage('Meraki API key configured securely.');
}

async function removeMerakiApiKey(secrets: SecretProvider): Promise<void> {
  const confirmation = await vscode.window.showWarningMessage(
    'Remove the stored Meraki API key?',
    { modal: true },
    'Remove',
  );
  if (confirmation !== 'Remove') return;

  await secrets.deleteSecret(MERAKI_API_KEY_SECRET);
  await vscode.window.showInformationMessage('Meraki API key removed.');
}

async function checkMerakiApiConfiguration(secrets: SecretProvider): Promise<void> {
  const configured = Boolean(await secrets.getSecret(MERAKI_API_KEY_SECRET));
  await vscode.window.showInformationMessage(
    `Meraki API configuration: ${configured ? 'Configured' : 'Not configured'}`,
  );
}

async function validateMerakiConnectionCommand(secrets: SecretProvider): Promise<void> {
  const result = await validateMerakiConnection(secrets);
  const lines = [
    result.message,
    '',
    `Authentication: ${result.authentication}`,
    `API Reachability: ${result.apiReachability}`,
    `Organizations: ${result.organizations.length}`,
    `Evidence Normalization: ${result.evidenceNormalization}`,
    `Credential Exposure: ${result.credentialExposure} - none detected`,
    `Access Mode: ${result.accessMode}`,
  ];
  if (result.organizations.length) {
    lines.push('', 'Organizations:', ...result.organizations, '', 'No configuration changes performed.');
  }
  if (result.gate2) {
    lines.push(
      '',
      'Gate 2 Organization:', result.gate2.organizationName,
      `Network count: ${result.gate2.networkCount}`,
      `Device count: ${result.gate2.deviceCount}`,
      'Devices by product type:',
      ...Object.entries(result.gate2.devicesByProductType).map(([productType, count]) => `  ${productType}: ${count}`),
      `Evidence Normalization: ${result.gate2.evidenceNormalization}`,
      `Pagination: ${result.gate2.pagination}`,
      `Cache: ${result.gate2.cacheSummary}`,
      `Access Mode: ${result.gate2.accessMode}`,
      '',
      'No configuration changes performed.',
    );
    if (result.gate2.inventory) {
      const inventory = result.gate2.inventory;
      lines.push(
        '',
        'MERAKI INVENTORY VALIDATION',
        '',
        `Organization: ${inventory.organizationName}`,
        '',
        `Networks: ${inventory.networkCount}`,
        `Devices: ${inventory.deviceCount}`,
        '',
        'Product Types:',
        ...Object.entries(inventory.productTypes).map(([productType, count]) => `${productType}: ${count}`),
        '',
        `Inventory normalization: ${inventory.inventoryNormalization}`,
        `Duplicate device check: ${inventory.duplicateDeviceCheck}`,
        `Network/device relationship check: ${inventory.relationshipCheck}`,
        `Index validation: ${inventory.indexValidation}`,
        `Evidence provenance: ${inventory.evidenceProvenance}`,
        `Access mode: ${inventory.accessMode}`,
      );
    }
  }
  const show = result.ok ? vscode.window.showInformationMessage : vscode.window.showErrorMessage;
  await show(lines.join('\n'));
}
