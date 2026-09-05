import * as vscode from 'vscode';
import { SecretProvider } from '../../core/secrets';

export class VscodeSecretProvider implements SecretProvider {
  constructor(private readonly secrets: vscode.SecretStorage) {}

  getSecret(key: string): Promise<string | undefined> {
    return Promise.resolve(this.secrets.get(key));
  }

  setSecret(key: string, value: string): Promise<void> {
    return Promise.resolve(this.secrets.store(key, value));
  }

  deleteSecret(key: string): Promise<void> {
    return Promise.resolve(this.secrets.delete(key));
  }
}
