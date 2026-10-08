export interface ExampleEntry {
  key: string;
  value: string;
  comments: string[];
}

export function parseExample(text: string): ExampleEntry[];

export function healEnv(options: {
  examplePath: string;
  envPath: string;
  generateSecret?: (key: string) => string;
  now?: () => Date;
}): { created: boolean; added: string[] };

export function findMissingDependencies(packageDir: string): string[];
