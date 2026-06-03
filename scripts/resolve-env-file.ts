export function resolveEnvFile(): string {
  return process.env.ENV_FILE ?? '.env.local';
}

export function isProdEnvFile(envFile: string): boolean {
  return /\.prod\b/i.test(envFile);
}
