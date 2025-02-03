declare module "cookie" {
    export function parse(cookie: string): { [key: string]: string };
    export function serialize(name: string, value: string, options?: any): string;
  }
  