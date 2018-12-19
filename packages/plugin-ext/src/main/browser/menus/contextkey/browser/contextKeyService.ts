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

import { injectable, unmanaged, inject } from 'inversify';
import { PreferenceService } from '@theia/core/lib/browser';
import { Event, Emitter, DisposableCollection, Disposable } from '@theia/core/lib/common';
import {
    ContextKeyExpr, IContext, IContextKey, IContextKeyChangeEvent,
    IContextKeyService, IContextKeyServiceTarget, IReadableSet
} from '../common/contextkey';

const KEYBINDING_CONTEXT_ATTR = 'data-keybinding-context';

export class Context implements IContext {

    protected _parent: Context | undefined;
    // tslint:disable-next-line:no-any
    protected _value: { [key: string]: any; };
    protected _id: number;

    constructor(id: number, parent: Context | undefined) {
        this._id = id;
        this._parent = parent;
        // tslint:disable-next-line:no-null-keyword
        this._value = Object.create(null);
        this._value['_contextId'] = id;
    }

    // tslint:disable-next-line:no-any
    public setValue(key: string, value: any): boolean {
        // console.log('SET ' + key + ' = ' + value + ' ON ' + this._id);
        if (this._value[key] !== value) {
            this._value[key] = value;
            return true;
        }
        return false;
    }

    public removeValue(key: string): boolean {
        // console.log('REMOVE ' + key + ' FROM ' + this._id);
        if (key in this._value) {
            delete this._value[key];
            return true;
        }
        return false;
    }

    public getValue<T>(key: string): T | undefined {
        const ret = this._value[key];
        if (typeof ret === 'undefined' && this._parent) {
            return this._parent.getValue<T>(key);
        }
        return ret;
    }

    // tslint:disable-next-line:no-any
    collectAllValues(): { [key: string]: any; } {
        // tslint:disable-next-line:no-null-keyword
        let result = this._parent ? this._parent.collectAllValues() : Object.create(null);
        result = { ...result, ...this._value };
        delete result['_contextId'];
        return result;
    }
}

class NullContext extends Context {

    static readonly INSTANCE = new NullContext();

    constructor() {
        super(-1, undefined);
    }

    // tslint:disable-next-line:no-any
    public setValue(key: string, value: any): boolean {
        return false;
    }

    public removeValue(key: string): boolean {
        return false;
    }

    public getValue<T>(key: string): T | undefined {
        return undefined;
    }

    // tslint:disable-next-line:no-any
    collectAllValues(): { [key: string]: any; } {
        // tslint:disable-next-line:no-null-keyword
        return Object.create(null);
    }
}

class ConfigAwareContextValuesContainer extends Context {

    private static _keyPrefix = 'config.';

    // tslint:disable-next-line:no-any
    private readonly _values = new Map<string, any>();
    private readonly _listener: Disposable;

    constructor(
        id: number,
        private readonly _configurationService: PreferenceService,
        emitter: Emitter<string | string[]>
    ) {
        super(id, undefined);

        // tslint:disable-next-line:no-any
        this._listener = this._configurationService.onPreferenceChanged(event => {
            // if (event.source === ConfigurationTarget.DEFAULT) {
            //     // new setting, reset everything
            //     const allKeys = keys(this._values);
            //     this._values.clear();
            //     emitter.fire(allKeys);
            // } else {
            const changedKeys: string[] = [];
            const contextKey = `config.${event.preferenceName}`;
            if (this._values.has(contextKey)) {
                this._values.delete(contextKey);
                changedKeys.push(contextKey);
            }
            emitter.fire(changedKeys);
            // }
        });
    }

    dispose(): void {
        this._listener.dispose();
    }

    // tslint:disable-next-line:no-any
    getValue(key: string): any {

        if (key.indexOf(ConfigAwareContextValuesContainer._keyPrefix) !== 0) {
            return super.getValue(key);
        }

        if (this._values.has(key)) {
            return this._values.get(key);
        }

        const configKey = key.substr(ConfigAwareContextValuesContainer._keyPrefix.length);
        const configValue = this._configurationService.get(configKey);
        // tslint:disable-next-line:no-any
        let value: any = undefined;
        switch (typeof configValue) {
            case 'number':
            case 'boolean':
            case 'string':
                value = configValue;
                break;
        }

        this._values.set(key, value);
        return value;
    }

    // tslint:disable-next-line:no-any
    setValue(key: string, value: any): boolean {
        return super.setValue(key, value);
    }

    removeValue(key: string): boolean {
        return super.removeValue(key);
    }

    // tslint:disable-next-line:no-any
    collectAllValues(): { [key: string]: any; } {
        const result: {
            // tslint:disable-next-line:no-any
            [key: string]: any
            // tslint:disable-next-line:no-null-keyword
        } = Object.create(null);
        this._values.forEach((value, index) => result[index] = value);
        return { ...result, ...super.collectAllValues() };
    }
}

class ContextKey<T> implements IContextKey<T> {

    private _parent: AbstractContextKeyService;
    private _key: string;
    private _defaultValue: T | undefined;

    constructor(parent: AbstractContextKeyService, key: string, defaultValue: T | undefined) {
        this._parent = parent;
        this._key = key;
        this._defaultValue = defaultValue;
        this.reset();
    }

    public set(value: T): void {
        this._parent.setContext(this._key, value);
    }

    public reset(): void {
        if (typeof this._defaultValue === 'undefined') {
            this._parent.removeContext(this._key);
        } else {
            this._parent.setContext(this._key, this._defaultValue);
        }
    }

    public get(): T | undefined {
        return this._parent.getContextKeyValue<T>(this._key);
    }
}

class SimpleContextKeyChangeEvent implements IContextKeyChangeEvent {
    constructor(private readonly _key: string) { }
    // tslint:disable-next-line:no-shadowed-variable
    affectsSome(keys: IReadableSet<string>): boolean {
        return keys.has(this._key);
    }
}
class ArrayContextKeyChangeEvent implements IContextKeyChangeEvent {
    constructor(private readonly _keys: string[]) { }
    // tslint:disable-next-line:no-shadowed-variable
    affectsSome(keys: IReadableSet<string>): boolean {
        for (const key of this._keys) {
            if (keys.has(key)) {
                return true;
            }
        }
        return false;
    }
}

@injectable()
export abstract class AbstractContextKeyService implements IContextKeyService {
    // tslint:disable-next-line:no-any
    public _serviceBrand: any;

    protected _isDisposed: boolean;
    protected _onDidChangeContext: Event<IContextKeyChangeEvent>;
    protected _onDidChangeContextKey: Emitter<string | string[]>;
    protected _myContextId: number;

    constructor(@unmanaged() myContextId: number) {
        this._isDisposed = false;
        this._myContextId = myContextId;
        this._onDidChangeContextKey = new Emitter<string>();
    }

    abstract dispose(): void;

    public createKey<T>(key: string, defaultValue: T | undefined): IContextKey<T> {
        if (this._isDisposed) {
            throw new Error('AbstractContextKeyService has been disposed');
        }
        return new ContextKey(this, key, defaultValue);
    }

    public get onDidChangeContext(): Event<IContextKeyChangeEvent> {
        if (!this._onDidChangeContext) {
            this._onDidChangeContext = Event.map(this._onDidChangeContextKey.event, ((changedKeyOrKeys: string | string[]): IContextKeyChangeEvent =>
                typeof changedKeyOrKeys === 'string'
                    ? new SimpleContextKeyChangeEvent(changedKeyOrKeys)
                    : new ArrayContextKeyChangeEvent(changedKeyOrKeys)
            ));
        }
        return this._onDidChangeContext;
    }

    public createScoped(domNode: IContextKeyServiceTarget): IContextKeyService {
        if (this._isDisposed) {
            throw new Error('AbstractContextKeyService has been disposed');
        }
        return new ScopedContextKeyService(this, this._onDidChangeContextKey, domNode);
    }

    public contextMatchesRules(rules: ContextKeyExpr | undefined): boolean {
        if (this._isDisposed) {
            throw new Error('AbstractContextKeyService has been disposed');
        }
        const context = this.getContextValuesContainer(this._myContextId);
        if (!rules) {
            return true;
        }
        // console.group(rules.serialize() + ' -> ' + result);
        // rules.keys().forEach(key => { console.log(key, ctx[key]); });
        // console.groupEnd();
        return rules.evaluate(context);
    }

    public getContextKeyValue<T>(key: string): T | undefined {
        if (this._isDisposed) {
            return undefined;
        }
        return this.getContextValuesContainer(this._myContextId).getValue<T>(key);
    }

    // tslint:disable-next-line:no-any
    public setContext(key: string, value: any): void {
        if (this._isDisposed) {
            return;
        }
        const myContext = this.getContextValuesContainer(this._myContextId);
        if (!myContext) {
            return;
        }
        if (myContext.setValue(key, value)) {
            this._onDidChangeContextKey.fire(key);
        }
    }

    public removeContext(key: string): void {
        if (this._isDisposed) {
            return;
        }
        if (this.getContextValuesContainer(this._myContextId).removeValue(key)) {
            this._onDidChangeContextKey.fire(key);
        }
    }

    public getContext(target: IContextKeyServiceTarget | null): IContext {
        if (this._isDisposed) {
            return NullContext.INSTANCE;
        }
        return this.getContextValuesContainer(findContextAttr(target));
    }

    public abstract getContextValuesContainer(contextId: number): Context;
    public abstract createChildContext(parentContextId?: number): number;
    public abstract disposeContext(contextId: number): void;
}

@injectable()
export class ContextKeyService extends AbstractContextKeyService implements IContextKeyService {

    private _lastContextId: number;
    private _contexts: {
        [contextId: string]: Context;
    };

    private _toDispose: DisposableCollection;

    constructor(@inject(PreferenceService) configurationService: PreferenceService) {
        super(0);
        this._toDispose = new DisposableCollection();
        this._lastContextId = 0;
        // tslint:disable-next-line:no-null-keyword
        this._contexts = Object.create(null);

        const myContext = new ConfigAwareContextValuesContainer(this._myContextId, configurationService, this._onDidChangeContextKey);
        this._contexts[String(this._myContextId)] = myContext;
        this._toDispose.push(myContext);

        // Uncomment this to see the contexts continuously logged
        // let lastLoggedValue: string | undefined = undefined;
        // setInterval(() => {
        //     const values = Object.keys(this._contexts).map(key => this._contexts[key]);
        //     const logValue = values.map(v => JSON.stringify(v._value, undefined, '\t')).join('\n');
        //     if (lastLoggedValue !== logValue) {
        //         lastLoggedValue = logValue;
        //         console.log(lastLoggedValue);
        //     }
        // }, 2000);
    }

    public dispose(): void {
        this._isDisposed = true;
        this._toDispose.dispose();
    }

    public getContextValuesContainer(contextId: number): Context {
        if (this._isDisposed) {
            return NullContext.INSTANCE;
        }
        return this._contexts[String(contextId)];
    }

    public createChildContext(parentContextId: number = this._myContextId): number {
        if (this._isDisposed) {
            throw new Error('ContextKeyService has been disposed');
        }
        const id = (++this._lastContextId);
        this._contexts[String(id)] = new Context(id, this.getContextValuesContainer(parentContextId));
        return id;
    }

    public disposeContext(contextId: number): void {
        if (this._isDisposed) {
            return;
        }
        delete this._contexts[String(contextId)];
    }
}

class ScopedContextKeyService extends AbstractContextKeyService {

    private _parent: AbstractContextKeyService;
    private _domNode: IContextKeyServiceTarget | undefined;

    constructor(parent: AbstractContextKeyService, emitter: Emitter<string | string[]>, domNode?: IContextKeyServiceTarget) {
        super(parent.createChildContext());
        this._parent = parent;
        this._onDidChangeContextKey = emitter;

        if (domNode) {
            this._domNode = domNode;
            this._domNode.setAttribute(KEYBINDING_CONTEXT_ATTR, String(this._myContextId));
        }
    }

    public dispose(): void {
        this._isDisposed = true;
        this._parent.disposeContext(this._myContextId);
        if (this._domNode) {
            this._domNode.removeAttribute(KEYBINDING_CONTEXT_ATTR);
            this._domNode = undefined;
        }
    }

    public get onDidChangeContext(): Event<IContextKeyChangeEvent> {
        return this._parent.onDidChangeContext;
    }

    public getContextValuesContainer(contextId: number): Context {
        if (this._isDisposed) {
            return NullContext.INSTANCE;
        }
        return this._parent.getContextValuesContainer(contextId);
    }

    public createChildContext(parentContextId: number = this._myContextId): number {
        if (this._isDisposed) {
            throw new Error('ScopedContextKeyService has been disposed');
        }
        return this._parent.createChildContext(parentContextId);
    }

    public disposeContext(contextId: number): void {
        if (this._isDisposed) {
            return;
        }
        this._parent.disposeContext(contextId);
    }
}

function findContextAttr(domNode: IContextKeyServiceTarget | null): number {
    while (domNode) {
        if (domNode.hasAttribute(KEYBINDING_CONTEXT_ATTR)) {
            const attr = domNode.getAttribute(KEYBINDING_CONTEXT_ATTR);
            if (attr) {
                return parseInt(attr, 10);
            }
            return NaN;
        }
        domNode = domNode.parentElement;
    }
    return 0;
}
