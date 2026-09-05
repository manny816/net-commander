import * as vscode from 'vscode';
import { SecretProvider } from '../../core/secrets';
import { VscodeSecretProvider } from './vscodeSecretProvider';

export const MERAKI_API_KEY_SECRET = 'jcg.meraki.apiKey';

export const enum MerakiSecretCommand {
  Configure = 'net-commander.configureMerakiApiKey',
  Remove = 'net-commander.removeMerakiApiKey',
  Check = 'net-commander.checkMerakiApiConfiguration',
}

export function registerMerakiSecretCommands(context: vscode.ExtensionContext): void {
  const secrets = new VscodeSecretProvider(context.secrets);
  context.subscriptions.push(
    vscode.commands.registerCommand(MerakiSecretCommand.Configure, () => configureMerakiApiKey(secrets)),
    vscode.commands.registerCommand(MerakiSecretCommand.Remove, () => removeMerakiApiKey(secrets)),
    vscode.commands.registerCommand(MerakiSecretCommand.Check, () => checkMerakiApiConfiguration(secrets)),
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
