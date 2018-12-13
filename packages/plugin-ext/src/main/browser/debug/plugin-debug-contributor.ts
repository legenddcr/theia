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

import { DebugExt, } from '../../../api/plugin-api';
import { LabelProvider } from '@theia/core/lib/browser';
import { EditorManager } from '@theia/editor/lib/browser';
import { BreakpointManager } from '@theia/debug/lib/browser/breakpoint/breakpoint-manager';
import { DebugContributor } from '@theia/debug/lib/browser/debug-contribution-manager';
import { TerminalService } from '@theia/terminal/lib/browser/base/terminal-service';
import { MessageClient } from '@theia/core/lib/common/message-service-protocol';
import { OutputChannelManager } from '@theia/output/lib/common/output-channel';
import { DebugPreferences } from '@theia/debug/lib/browser/debug-preferences';
import { DebugConfiguration } from '@theia/debug/lib/common/debug-configuration';
import { IJSONSchemaSnippet, IJSONSchema } from '@theia/core/src/common/json-schema';
import { DebuggerDescription } from '@theia/debug/lib/common/debug-service';
import { DebugSessionFactory } from '@theia/debug/lib/browser/debug-session-contribution';
import { PluginDebugSessionFactory } from './plugin-debug-session-factory';
import { ConnectionMainImpl } from '../connection-main';
import { PluginWebSocketChannel } from '../../../common/connection';

export class PluginDebugContributor implements DebugContributor {
    constructor(
        readonly description: DebuggerDescription,
        protected readonly contributorId: string,
        protected readonly debugExt: DebugExt,
        protected readonly labelProvider: LabelProvider,
        protected readonly editorManager: EditorManager,
        protected readonly breakpointsManager: BreakpointManager,
        protected readonly terminalService: TerminalService,
        protected readonly messages: MessageClient,
        protected readonly outputChannelManager: OutputChannelManager,
        protected readonly debugPreferences: DebugPreferences,
        protected readonly connectionMain: ConnectionMainImpl) { }

    async provideDebugConfigurations(workspaceFolderUri: string | undefined): Promise<DebugConfiguration[]> {
        return this.debugExt.$provideDebugConfigurations(this.contributorId, workspaceFolderUri);
    }

    async resolveDebugConfiguration(config: DebugConfiguration, workspaceFolderUri: string | undefined): Promise<DebugConfiguration | undefined> {
        return this.debugExt.$resolveDebugConfigurations(this.contributorId, config, workspaceFolderUri);
    }

    async getSupportedLanguages(): Promise<string[]> {
        return this.debugExt.$getSupportedLanguages(this.contributorId);
    }

    async getSchemaAttributes(): Promise<IJSONSchema[]> {
        return this.debugExt.$getSchemaAttributes(this.contributorId);
    }

    async getConfigurationSnippets(): Promise<IJSONSchemaSnippet[]> {
        return this.debugExt.$getConfigurationSnippets(this.contributorId);
    }

    async createDebugSession(debugConfiguration: DebugConfiguration): Promise<string> {
        return this.debugExt.$createDebugSession(this.contributorId, debugConfiguration);
    }

    async terminateDebugSession(sessionId: string): Promise<void> {
        return this.debugExt.$terminateDebugSession(sessionId);
    }

    async debugSessionFactory(): Promise<DebugSessionFactory> {
        const connectionFactory = async (sessionId: string) => {
            const connection = await this.connectionMain.ensureConnection(sessionId);
            return new PluginWebSocketChannel(connection);
        };

        return new PluginDebugSessionFactory(
            this.terminalService,
            this.editorManager,
            this.breakpointsManager,
            this.labelProvider,
            this.messages,
            this.outputChannelManager,
            this.debugPreferences,
            connectionFactory
        );
    }
}
