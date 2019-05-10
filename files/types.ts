import { DocumentNode } from 'graphql';
import { manifest } from './manifest';

export { DocumentNode } from 'graphql';
export { manifest } from './manifest';
export type IDocumentNodes = { [f in typeof manifest[number]]: DocumentNode };
