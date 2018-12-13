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

// tslint:disable:no-any

import { interfaces } from 'inversify';
import { RPCProtocol } from '../../../api/rpc-protocol';
import {
    DebugMain,
    DebugExt,
    MAIN_RPC_CONTEXT
} from '../../../api/plugin-api';
import { DebugSessionManager } from '@theia/debug/lib/browser/debug-session-manager';
import { Breakpoint, WorkspaceFolder } from '../../../api/model';
import { LabelProvider } from '@theia/core/lib/browser';
import { EditorManager } from '@theia/editor/lib/browser';
import { BreakpointManager } from '@theia/debug/lib/browser/breakpoint/breakpoint-manager';
import { DebugBreakpoint } from '@theia/debug/lib/browser/model/debug-breakpoint';
import URI from 'vscode-uri';
import { DebugConsoleSession } from '@theia/debug/lib/browser/console/debug-console-session';
import { SourceBreakpoint } from '@theia/debug/lib/browser/breakpoint/breakpoint-marker';
import { DebugContributor, DebugContributionManager } from '@theia/debug/lib/browser/debug-contribution-manager';
import { DebugConfiguration } from '@theia/debug/lib/common/debug-configuration';
import { ConnectionMainImpl } from '../connection-main';
import { DebuggerDescription } from '@theia/debug/lib/common/debug-service';
import { DebugProtocol } from 'vscode-debugprotocol';
import { DebugConfigurationManager } from '@theia/debug/lib/browser/debug-configuration-manager';
import { TerminalService } from '@theia/terminal/lib/browser/base/terminal-service';
import { MessageClient } from '@theia/core/lib/common/message-service-protocol';
import { OutputChannelManager } from '@theia/output/lib/common/output-channel';
import { DebugPreferences } from '@theia/debug/lib/browser/debug-preferences';
import { PluginDebugContributor } from './plugin-debug-contributor';

export class DebugMainImpl implements DebugMain {
    private readonly debugExt: DebugExt;

    private readonly sessionManager: DebugSessionManager;
    private readonly labelProvider: LabelProvider;
    private readonly editorManager: EditorManager;
    private readonly breakpointsManager: BreakpointManager;
    private readonly debugConsoleSession: DebugConsoleSession;
    private readonly contributionManager: DebugContributionManager;
    private readonly configurationManager: DebugConfigurationManager;
    private readonly terminalService: TerminalService;
    private readonly messages: MessageClient;
    private readonly outputChannelManager: OutputChannelManager;
    private readonly debugPreferences: DebugPreferences;

    // registered plugins per contributorId
    private readonly proxyContributors = new Map<string, DebugContributor>();

    constructor(rpc: RPCProtocol, readonly connectionMain: ConnectionMainImpl, container: interfaces.Container) {
        this.debugExt = rpc.getProxy(MAIN_RPC_CONTEXT.DEBUG_EXT);
        this.contributionManager = container.get(DebugContributionManager);
        this.sessionManager = container.get(DebugSessionManager);
        this.labelProvider = container.get(LabelProvider);
        this.editorManager = container.get(EditorManager);
        this.breakpointsManager = container.get(BreakpointManager);
        this.debugConsoleSession = container.get(DebugConsoleSession);
        this.configurationManager = container.get(DebugConfigurationManager);
        this.terminalService = container.get(TerminalService);
        this.messages = container.get(MessageClient);
        this.outputChannelManager = container.get(OutputChannelManager);
        this.debugPreferences = container.get(DebugPreferences);

        // TODO: distinguish added/deleted breakpoints
        this.breakpointsManager.onDidChangeMarkers(uri => {
            const all = this.breakpointsManager.getBreakpoints();
            const affected = this.breakpointsManager.getBreakpoints(uri);
            this.debugExt.$breakpointsDidChange(this.toTheiaPluginApiBreakpoints(all), [], [], this.toTheiaPluginApiBreakpoints(affected));
        });

        this.sessionManager.onDidCreateDebugSession(debugSession => this.debugExt.$sessionDidCreate(debugSession.id));
        this.sessionManager.onDidDestroyDebugSession(debugSession => this.debugExt.$sessionDidDestroy(debugSession.id));
        this.sessionManager.onDidChangeActiveDebugSession(event => this.debugExt.$sessionDidChange(event.current && event.current.id));
        this.sessionManager.onDidReceiveDebugSessionCustomEvent(event => this.debugExt.$onSessionCustomEvent(event.session.id, event.event, event.body));
    }

    async $appendToDebugConsole(value: string): Promise<void> {
        this.debugConsoleSession.append(value);
    }

    async $appendLineToDebugConsole(value: string): Promise<void> {
        this.debugConsoleSession.appendLine(value);
    }

    async $registerDebugConfigurationProvider(contributorId: string, description: DebuggerDescription): Promise<void> {
        const proxyContributor = new PluginDebugContributor(description,
            contributorId,
            this.debugExt,
            this.labelProvider,
            this.editorManager,
            this.breakpointsManager,
            this.terminalService,
            this.messages,
            this.outputChannelManager,
            this.debugPreferences,
            this.connectionMain);

        this.proxyContributors.set(contributorId, proxyContributor);
        this.contributionManager.registerDebugPluginContributor(description.type, proxyContributor);
    }

    async $unregisterDebugConfigurationProvider(contributorId: string): Promise<void> {
        const contributor = this.proxyContributors.get(contributorId);
        if (contributor) {
            this.contributionManager.unregisterDebugPluginContributor(contributor.description.type);
            this.proxyContributors.delete(contributorId);
        }
    }

    async $addBreakpoints(breakpoints: Breakpoint[]): Promise<void> {
        this.sessionManager.addBreakpoints(this.toInternalBreakpoints(breakpoints));
    }

    async $removeBreakpoints(breakpoints: Breakpoint[]): Promise<void> {
        this.sessionManager.deleteBreakpoints(this.toInternalBreakpoints(breakpoints));
    }

    async $customRequest(sessionId: string, command: string, args?: any): Promise<DebugProtocol.Response> {
        const session = this.sessionManager.getSession(sessionId);
        if (session) {
            return session.sendCustomRequest(command, args);
        }

        throw new Error(`Debug session '${sessionId}' not found`);
    }

    async $startDebugging(folder: WorkspaceFolder | undefined, nameOrConfiguration: string | DebugConfiguration): Promise<boolean> {
        let configuration: DebugConfiguration | undefined;

        if (typeof nameOrConfiguration === 'string') {
            for (const options of this.configurationManager.all) {
                if (options.configuration.name === nameOrConfiguration) {
                    configuration = options.configuration;
                }
            }
        } else {
            configuration = nameOrConfiguration;
        }

        if (!configuration) {
            console.error(`There is no debug configuration for ${nameOrConfiguration}`);
            return false;
        }

        const session = await this.sessionManager.start({
            configuration,
            workspaceFolderUri: folder && URI.revive(folder.uri).toString()
        });

        return !!session;
    }

    private toInternalBreakpoints(breakpoints: Breakpoint[]): DebugBreakpoint[] {
        return breakpoints
            .filter(breakpoint => !!breakpoint.location)
            .map(breakpoint => {
                const location = breakpoint.location!;
                const uri = URI.revive(location.uri);
                const uriString = uri.toString();

                const origin = {
                    uri: uriString,
                    enabled: true,
                    raw: {
                        line: location.range.startLineNumber,
                        column: location.range.startColumn,
                        condition: breakpoint.condition,
                        hitCondition: breakpoint.hitCondition,
                        logMessage: breakpoint.logMessage
                    }
                };

                return new DebugBreakpoint(origin,
                    this.labelProvider,
                    this.breakpointsManager,
                    this.editorManager,
                    this.sessionManager.currentSession);
            });
    }

    private toTheiaPluginApiBreakpoints(sourceBreakpoints: SourceBreakpoint[]): Breakpoint[] {
        return sourceBreakpoints.map(b => {
            const breakpoint = {
                enabled: b.enabled,
                condition: b.raw.condition,
                hitCondition: b.raw.hitCondition,
                logMessage: b.raw.logMessage,
                location: {
                    uri: URI.parse(b.uri),
                    range: {
                        startLineNumber: b.raw.line,
                        startColumn: b.raw.column || 0,
                        endLineNumber: b.raw.line,
                        endColumn: b.raw.column || 0
                    }
                }
            };

            return breakpoint;
        });
    }
}
