import {sqliteTable,text,integer} from 'drizzle-orm/sqlite-core';
export const accounts=sqliteTable('accounts',{id:text('id').primaryKey(),username:text('username').notNull(),usernameKey:text('username_key').notNull().unique(),salt:text('salt').notNull(),verifier:text('verifier').notNull(),createdAt:integer('created_at').notNull()});
export const sessions=sqliteTable('sessions',{hash:text('hash').primaryKey(),accountId:text('account_id').notNull(),expiresAt:integer('expires_at').notNull(),createdAt:integer('created_at').notNull()});
export const documents=sqliteTable('documents',{accountId:text('account_id').primaryKey(),revision:integer('revision').notNull().default(0),document:text('document').notNull().default('{}'),updatedAt:integer('updated_at').notNull()});
export const challenges=sqliteTable('challenges',{id:text('id').primaryKey(),expiresAt:integer('expires_at').notNull()});
export const budgets=sqliteTable('budgets',{id:text('id').primaryKey(),used:integer('used').notNull().default(0),expiresAt:integer('expires_at').notNull()});
