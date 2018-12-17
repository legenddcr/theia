/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '@theia/core/lib/common';
import { isFalsyOrWhitespace } from 'vs/base/common/strings';

export const enum ContextKeyExprType {
    Defined = 1,
    Not = 2,
    Equals = 3,
    NotEquals = 4,
    And = 5,
    Regex = 6
}

export abstract class ContextKeyExpr {

    public static has(key: string): ContextKeyExpr {
        return new ContextKeyDefinedExpr(key);
    }

    // tslint:disable-next-line:no-any
    public static equals(key: string, value: any): ContextKeyExpr {
        return new ContextKeyEqualsExpr(key, value);
    }

    // tslint:disable-next-line:no-any
    public static notEquals(key: string, value: any): ContextKeyExpr {
        return new ContextKeyNotEqualsExpr(key, value);
    }

    public static regex(key: string, value: RegExp): ContextKeyExpr {
        return new ContextKeyRegexExpr(key, value);
    }

    public static not(key: string): ContextKeyExpr {
        return new ContextKeyNotExpr(key);
    }

    public static and(...expr: (ContextKeyExpr | undefined)[]): ContextKeyExpr {
        return new ContextKeyAndExpr(expr);
    }

    public static deserialize(serialized: string | undefined): ContextKeyExpr | undefined {
        if (!serialized) {
            return undefined;
        }

        const pieces = serialized.split('&&');
        const result = new ContextKeyAndExpr(pieces.map(p => this._deserializeOne(p)));
        return result.normalize();
    }

    private static _deserializeOne(serializedOne: string): ContextKeyExpr {
        serializedOne = serializedOne.trim();

        if (serializedOne.indexOf('!=') >= 0) {
            const pieces = serializedOne.split('!=');
            return new ContextKeyNotEqualsExpr(pieces[0].trim(), this._deserializeValue(pieces[1]));
        }

        if (serializedOne.indexOf('==') >= 0) {
            const pieces = serializedOne.split('==');
            return new ContextKeyEqualsExpr(pieces[0].trim(), this._deserializeValue(pieces[1]));
        }

        if (serializedOne.indexOf('=~') >= 0) {
            const pieces = serializedOne.split('=~');
            return new ContextKeyRegexExpr(pieces[0].trim(), this._deserializeRegexValue(pieces[1]));
        }

        if (/^\!\s*/.test(serializedOne)) {
            return new ContextKeyNotExpr(serializedOne.substr(1).trim());
        }

        return new ContextKeyDefinedExpr(serializedOne);
    }

    // tslint:disable-next-line:no-any
    private static _deserializeValue(serializedValue: string): any {
        serializedValue = serializedValue.trim();

        if (serializedValue === 'true') {
            return true;
        }

        if (serializedValue === 'false') {
            return false;
        }

        const m = /^'([^']*)'$/.exec(serializedValue);
        if (m) {
            return m[1].trim();
        }

        return serializedValue;
    }

    private static _deserializeRegexValue(serializedValue: string): RegExp | undefined {

        if (isFalsyOrWhitespace(serializedValue)) {
            console.warn('missing regexp-value for =~-expression');
            return undefined;
        }

        const start = serializedValue.indexOf('/');
        const end = serializedValue.lastIndexOf('/');
        if (start === end || start < 0 /* || to < 0 */) {
            console.warn(`bad regexp-value '${serializedValue}', missing /-enclosure`);
            return undefined;
        }

        const value = serializedValue.slice(start + 1, end);
        const caseIgnoreFlag = serializedValue[end + 1] === 'i' ? 'i' : '';
        try {
            return new RegExp(value, caseIgnoreFlag);
        } catch (e) {
            console.warn(`bad regexp-value '${serializedValue}', parse error: ${e}`);
            return undefined;
        }
    }

    public abstract getType(): ContextKeyExprType;
    public abstract equals(other: ContextKeyExpr): boolean;
    public abstract evaluate(context: IContext): boolean;
    public abstract normalize(): ContextKeyExpr | undefined;
    public abstract serialize(): string;
    public abstract keys(): string[];
}

function cmp(a: ContextKeyExpr, b: ContextKeyExpr): number {
    const aType = a.getType();
    const bType = b.getType();
    if (aType !== bType) {
        return aType - bType;
    }
    switch (aType) {
        case ContextKeyExprType.Defined:
            return (<ContextKeyDefinedExpr>a).cmp(<ContextKeyDefinedExpr>b);
        case ContextKeyExprType.Not:
            return (<ContextKeyNotExpr>a).cmp(<ContextKeyNotExpr>b);
        case ContextKeyExprType.Equals:
            return (<ContextKeyEqualsExpr>a).cmp(<ContextKeyEqualsExpr>b);
        case ContextKeyExprType.NotEquals:
            return (<ContextKeyNotEqualsExpr>a).cmp(<ContextKeyNotEqualsExpr>b);
        case ContextKeyExprType.Regex:
            return (<ContextKeyRegexExpr>a).cmp(<ContextKeyRegexExpr>b);
        default:
            throw new Error('Unknown ContextKeyExpr!');
    }
}

export class ContextKeyDefinedExpr implements ContextKeyExpr {
    constructor(protected key: string) {
    }

    public getType(): ContextKeyExprType {
        return ContextKeyExprType.Defined;
    }

    public cmp(other: ContextKeyDefinedExpr): number {
        if (this.key < other.key) {
            return -1;
        }
        if (this.key > other.key) {
            return 1;
        }
        return 0;
    }

    public equals(other: ContextKeyExpr): boolean {
        if (other instanceof ContextKeyDefinedExpr) {
            return (this.key === other.key);
        }
        return false;
    }

    public evaluate(context: IContext): boolean {
        return (!!context.getValue(this.key));
    }

    public normalize(): ContextKeyExpr {
        return this;
    }

    public serialize(): string {
        return this.key;
    }

    public keys(): string[] {
        return [this.key];
    }
}

export class ContextKeyEqualsExpr implements ContextKeyExpr {
    // tslint:disable-next-line:no-any
    constructor(private key: string, private value: any) {
    }

    public getType(): ContextKeyExprType {
        return ContextKeyExprType.Equals;
    }

    public cmp(other: ContextKeyEqualsExpr): number {
        if (this.key < other.key) {
            return -1;
        }
        if (this.key > other.key) {
            return 1;
        }
        if (this.value < other.value) {
            return -1;
        }
        if (this.value > other.value) {
            return 1;
        }
        return 0;
    }

    public equals(other: ContextKeyExpr): boolean {
        if (other instanceof ContextKeyEqualsExpr) {
            return (this.key === other.key && this.value === other.value);
        }
        return false;
    }

    public evaluate(context: IContext): boolean {
        /* tslint:disable:triple-equals */
        // Intentional ==
        return (context.getValue(this.key) == this.value);
        /* tslint:enable:triple-equals */
    }

    public normalize(): ContextKeyExpr {
        if (typeof this.value === 'boolean') {
            if (this.value) {
                return new ContextKeyDefinedExpr(this.key);
            }
            return new ContextKeyNotExpr(this.key);
        }
        return this;
    }

    public serialize(): string {
        if (typeof this.value === 'boolean') {
            return this.normalize().serialize();
        }

        return this.key + ' == \'' + this.value + '\'';
    }

    public keys(): string[] {
        return [this.key];
    }
}

export class ContextKeyNotEqualsExpr implements ContextKeyExpr {
    // tslint:disable-next-line:no-any
    constructor(private key: string, private value: any) {
    }

    public getType(): ContextKeyExprType {
        return ContextKeyExprType.NotEquals;
    }

    public cmp(other: ContextKeyNotEqualsExpr): number {
        if (this.key < other.key) {
            return -1;
        }
        if (this.key > other.key) {
            return 1;
        }
        if (this.value < other.value) {
            return -1;
        }
        if (this.value > other.value) {
            return 1;
        }
        return 0;
    }

    public equals(other: ContextKeyExpr): boolean {
        if (other instanceof ContextKeyNotEqualsExpr) {
            return (this.key === other.key && this.value === other.value);
        }
        return false;
    }

    public evaluate(context: IContext): boolean {
        /* tslint:disable:triple-equals */
        // Intentional !=
        return (context.getValue(this.key) != this.value);
        /* tslint:enable:triple-equals */
    }

    public normalize(): ContextKeyExpr {
        if (typeof this.value === 'boolean') {
            if (this.value) {
                return new ContextKeyNotExpr(this.key);
            }
            return new ContextKeyDefinedExpr(this.key);
        }
        return this;
    }

    public serialize(): string {
        if (typeof this.value === 'boolean') {
            return this.normalize().serialize();
        }

        return this.key + ' != \'' + this.value + '\'';
    }

    public keys(): string[] {
        return [this.key];
    }
}

export class ContextKeyNotExpr implements ContextKeyExpr {
    constructor(private key: string) {
    }

    public getType(): ContextKeyExprType {
        return ContextKeyExprType.Not;
    }

    public cmp(other: ContextKeyNotExpr): number {
        if (this.key < other.key) {
            return -1;
        }
        if (this.key > other.key) {
            return 1;
        }
        return 0;
    }

    public equals(other: ContextKeyExpr): boolean {
        if (other instanceof ContextKeyNotExpr) {
            return (this.key === other.key);
        }
        return false;
    }

    public evaluate(context: IContext): boolean {
        return (!context.getValue(this.key));
    }

    public normalize(): ContextKeyExpr {
        return this;
    }

    public serialize(): string {
        return '!' + this.key;
    }

    public keys(): string[] {
        return [this.key];
    }
}

export class ContextKeyRegexExpr implements ContextKeyExpr {

    constructor(private key: string, private regexp: RegExp | undefined) {
        //
    }

    public getType(): ContextKeyExprType {
        return ContextKeyExprType.Regex;
    }

    public cmp(other: ContextKeyRegexExpr): number {
        if (this.key < other.key) {
            return -1;
        }
        if (this.key > other.key) {
            return 1;
        }
        const thisSource = this.regexp ? this.regexp.source : '';
        const otherSource = other.regexp ? other.regexp.source : '';
        if (thisSource < otherSource) {
            return -1;
        }
        if (thisSource > otherSource) {
            return 1;
        }
        return 0;
    }

    public equals(other: ContextKeyExpr): boolean {
        if (other instanceof ContextKeyRegexExpr) {
            const thisSource = this.regexp ? this.regexp.source : '';
            const otherSource = other.regexp ? other.regexp.source : '';
            return (this.key === other.key && thisSource === otherSource);
        }
        return false;
    }

    public evaluate(context: IContext): boolean {
        // tslint:disable-next-line:no-any
        const value = context.getValue<any>(this.key);
        return this.regexp ? this.regexp.test(value) : false;
    }

    public normalize(): ContextKeyExpr {
        return this;
    }

    public serialize(): string {
        const value = this.regexp
            ? `/${this.regexp.source}/${this.regexp.ignoreCase ? 'i' : ''}`
            : '/invalid/';
        return `${this.key} =~ ${value}`;
    }

    public keys(): string[] {
        return [this.key];
    }
}

export class ContextKeyAndExpr implements ContextKeyExpr {
    public readonly expr: ContextKeyExpr[];

    constructor(expr: (ContextKeyExpr | undefined)[]) {
        this.expr = ContextKeyAndExpr._normalizeArr(expr);
    }

    public getType(): ContextKeyExprType {
        return ContextKeyExprType.And;
    }

    public equals(other: ContextKeyExpr): boolean {
        if (other instanceof ContextKeyAndExpr) {
            if (this.expr.length !== other.expr.length) {
                return false;
            }
            // tslint:disable-next-line:one-variable-per-declaration
            for (let i = 0, len = this.expr.length; i < len; i++) {
                if (!this.expr[i].equals(other.expr[i])) {
                    return false;
                }
            }
            return true;
        }
        return false;
    }

    public evaluate(context: IContext): boolean {
        // tslint:disable-next-line:one-variable-per-declaration
        for (let i = 0, len = this.expr.length; i < len; i++) {
            if (!this.expr[i].evaluate(context)) {
                return false;
            }
        }
        return true;
    }

    private static _normalizeArr(arr: (ContextKeyExpr | undefined)[]): ContextKeyExpr[] {
        let expr: ContextKeyExpr[] = [];

        if (arr) {
            // tslint:disable-next-line:one-variable-per-declaration
            for (let i = 0, len = arr.length; i < len; i++) {
                let e: ContextKeyExpr | undefined = arr[i];
                if (!e) {
                    continue;
                }

                e = e.normalize();
                if (!e) {
                    continue;
                }

                if (e instanceof ContextKeyAndExpr) {
                    expr = expr.concat(e.expr);
                    continue;
                }

                expr.push(e);
            }

            expr.sort(cmp);
        }

        return expr;
    }

    public normalize(): ContextKeyExpr | undefined {
        if (this.expr.length === 0) {
            return undefined;
        }

        if (this.expr.length === 1) {
            return this.expr[0];
        }

        return this;
    }

    public serialize(): string {
        if (this.expr.length === 0) {
            return '';
        }
        if (this.expr.length === 1) {
            const normalized = this.normalize();
            if (!normalized) {
                return '';
            }
            return normalized.serialize();
        }
        return this.expr.map(e => e.serialize()).join(' && ');
    }

    public keys(): string[] {
        const result: string[] = [];
        for (const expr of this.expr) {
            result.push(...expr.keys());
        }
        return result;
    }
}

export class RawContextKey<T> extends ContextKeyDefinedExpr {

    private _defaultValue: T | undefined;

    constructor(key: string, defaultValue: T | undefined) {
        super(key);
        this._defaultValue = defaultValue;
    }

    public bindTo(target: IContextKeyService): IContextKey<T> {
        return target.createKey(this.key, this._defaultValue);
    }

    public getValue(target: IContextKeyService): T | undefined {
        return target.getContextKeyValue<T>(this.key);
    }

    public toNegated(): ContextKeyExpr {
        return ContextKeyExpr.not(this.key);
    }

    public isEqualTo(value: string): ContextKeyExpr {
        return ContextKeyExpr.equals(this.key, value);
    }

    public notEqualsTo(value: string): ContextKeyExpr {
        return ContextKeyExpr.notEquals(this.key, value);
    }
}

export interface IContext {
    getValue<T>(key: string): T | undefined;
}

export interface IContextKey<T> {
    set(value: T): void;
    reset(): void;
    get(): T | undefined;
}

export interface IContextKeyServiceTarget {
    parentElement: IContextKeyServiceTarget | null;
    setAttribute(attr: string, value: string): void;
    removeAttribute(attr: string): void;
    hasAttribute(attr: string): boolean;
    getAttribute(attr: string): string | null;
}

export interface IReadableSet<T> {
    has(value: T): boolean;
}

export interface IContextKeyChangeEvent {
    affectsSome(keys: IReadableSet<string>): boolean;
}

export const IContextKeyService = Symbol('IContextKeyService');
export interface IContextKeyService {
    // tslint:disable-next-line:no-any
    _serviceBrand: any;
    dispose(): void;

    onDidChangeContext: Event<IContextKeyChangeEvent>;
    createKey<T>(key: string, defaultValue: T | undefined): IContextKey<T>;
    contextMatchesRules(rules: ContextKeyExpr | undefined): boolean;
    getContextKeyValue<T>(key: string): T | undefined;

    createScoped(target?: IContextKeyServiceTarget): IContextKeyService;
    getContext(target: IContextKeyServiceTarget | null): IContext;
}

export const SET_CONTEXT_COMMAND_ID = 'setContext';
