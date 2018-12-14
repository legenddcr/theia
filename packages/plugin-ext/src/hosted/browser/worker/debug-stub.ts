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

import { RPCProtocol } from '../../../api/rpc-protocol';
import * as theia from '@theia/plugin';
import { DebugExtImpl } from '../../../plugin/node/debug/debug';
import { Disposable } from '../../../plugin/types-impl';
import { PluginPackageDebuggersContribution } from '../../../common';

/**
 * Debug API requires access to node to start Debug Adapter.
 * This stub for [DebugExtImpl](#DebugExtImpl) prevents using Debug API in Web Worker.
 */
export class DebugExtStub extends DebugExtImpl {
    constructor(rpc: RPCProtocol) {
        super(rpc);
    }

    get onDidReceiveDebugSessionCustomEvent(): theia.Event<theia.DebugSessionCustomEvent> {
        throw new Error('Debug API works only in plugin container');
    }

    get onDidChangeActiveDebugSession(): theia.Event<theia.DebugSession | undefined> {
        throw new Error('Debug API works only in plugin container');
    }

    get onDidTerminateDebugSession(): theia.Event<theia.DebugSession> {
        throw new Error('Debug API works only in plugin container');
    }

    get onDidStartDebugSession(): theia.Event<theia.DebugSession> {
        throw new Error('Debug API works only in plugin container');
    }

    get onDidChangeBreakpoints(): theia.Event<theia.BreakpointsChangeEvent> {
        throw new Error('Debug API works only in plugin container');
    }

    get breakpoints(): theia.Breakpoint[] {
        throw new Error('Debug API works only in plugin container');
    }

    get activeDebugSession(): theia.DebugSession | undefined {
        throw new Error('Debug API works only in plugin container');
    }

    get activeDebugConsole(): theia.DebugConsole {
        throw new Error('Debug API works only in plugin container');
    }

    addBreakpoints(breakpoints: theia.Breakpoint[]): void {
        throw new Error('Debug API works only in plugin container');
    }

    removeBreakpoints(breakpoints: theia.Breakpoint[]): void {
        throw new Error('Debug API works only in plugin container');
    }

    startDebugging(folder: theia.WorkspaceFolder | undefined, nameOrConfiguration: string | theia.DebugConfiguration): PromiseLike<boolean> {
        throw new Error('Debug API works only in plugin container');
    }

    registerDebugConfigurationProvider(
        debugType: string,
        provider: theia.DebugConfigurationProvider,
        packageContribution: PluginPackageDebuggersContribution,
        pluginPath: string): Disposable {
        throw new Error('Debug API works only in plugin container');
    }
}
