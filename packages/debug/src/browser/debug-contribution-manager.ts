/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
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

import { injectable, inject } from 'inversify';
import { DebugConfiguration } from '../common/debug-common';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { Disposable } from '@theia/core/lib/common/disposable';
import { DebugService, DebuggerDescription } from '../common/debug-service';
import { IJSONSchema, IJSONSchemaSnippet } from '@theia/core/lib/common/json-schema';
import { Emitter, Event } from '@theia/core/lib/common/event';
import { DebugSessionFactory } from './debug-session-contribution';
import { TerminalService } from '@theia/terminal/lib/browser/base/terminal-service';
import { EditorManager } from '@theia/editor/lib/browser/editor-manager';
import { BreakpointManager } from './breakpoint/breakpoint-manager';
import { LabelProvider } from '@theia/core/lib/browser/label-provider';
import { MessageClient } from '@theia/core/lib/common/message-service-protocol';
import { OutputChannelManager } from '@theia/output/lib/common/output-channel';
import { DebugPreferences } from './debug-preferences';
import { DebugSessionContributionRegistry } from './debug-session-contribution-registry';

/**
 * Describes what debug contribution has to provide for a client.
 */
export interface DebugContributor {
    description: DebuggerDescription;
    getSupportedLanguages(): Promise<string[]>;
    getSchemaAttributes(): Promise<IJSONSchema[]>;
    getConfigurationSnippets(): Promise<IJSONSchemaSnippet[]>;
    provideDebugConfigurations(workspaceFolderUri: string | undefined): Promise<DebugConfiguration[]>;
    resolveDebugConfiguration(config: DebugConfiguration, workspaceFolderUri: string | undefined): Promise<DebugConfiguration | undefined>;
    createDebugSession(config: DebugConfiguration): Promise<string>;
    terminateDebugSession(sessionId: string): Promise<void>;
    debugSessionFactory(): Promise<DebugSessionFactory>;
}

/**
 * [DebugContributor](#DebugContributor) manager.
 */
@injectable()
export class DebugContributionManager {
    protected readonly contributors = new Map<string, DebugContributor>();

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;
    @inject(DebugService)
    protected readonly debugService: DebugService;
    @inject(DebugSessionContributionRegistry)
    protected readonly sessionContributionRegistry: DebugSessionContributionRegistry;
    @inject(TerminalService)
    protected readonly terminalService: TerminalService;
    @inject(EditorManager)
    protected readonly editorManager: EditorManager;
    @inject(BreakpointManager)
    protected readonly breakpoints: BreakpointManager;
    @inject(LabelProvider)
    protected readonly labelProvider: LabelProvider;
    @inject(MessageClient)
    protected readonly messages: MessageClient;
    @inject(OutputChannelManager)
    protected readonly outputChannelManager: OutputChannelManager;
    @inject(DebugPreferences)
    protected readonly debugPreferences: DebugPreferences;

    protected readonly onDidAddContributionEmitter = new Emitter<string>();
    readonly onDidAddContribution: Event<string> = this.onDidAddContributionEmitter.event;
    protected fireDidAddContribution(debugType: string): void {
        this.onDidAddContributionEmitter.fire(debugType);
    }

    protected readonly onDidDeleteContributionEmitter = new Emitter<string>();
    readonly onDidDeleteContribution: Event<string> = this.onDidDeleteContributionEmitter.event;
    protected fireDidDeleteContribution(debugType: string): void {
        this.onDidDeleteContributionEmitter.fire(debugType);
    }

    async registerDebugContributor(type: string, contributor: DebugContributor): Promise<Disposable> {
        if (await this.isContributorRegistered(type)) {
            console.warn(`Debugger with type '${type}' already registered.`);
            return Disposable.NULL;
        }

        if (contributor.debugSessionFactory) {
            const debugSessionFactory = await contributor.debugSessionFactory();
            this.sessionContributionRegistry.registerDebugSessionContribution(type,
                {
                    debugType: type,
                    debugSessionFactory: () => debugSessionFactory
                });
        }

        this.contributors.set(type, contributor);
        this.fireDidAddContribution(type);
        return Disposable.create(() => this.unregisterDebugContributor(type));
    }

    async unregisterDebugContributor(debugType: string): Promise<void> {
        this.contributors.delete(debugType);
        this.sessionContributionRegistry.unregisterDebugSessionContribution(debugType);
        this.fireDidDeleteContribution(debugType);
    }

    async debugTypes(): Promise<string[]> {
        const debugTypes = await this.debugService.debugTypes();
        return debugTypes.concat(Array.from(this.contributors.keys()));
    }

    async provideDebugConfigurations(debugType: string, workspaceFolderUri: string | undefined): Promise<DebugConfiguration[]> {
        const contributor = this.contributors.get(debugType);
        if (contributor) {
            return contributor.provideDebugConfigurations(workspaceFolderUri);
        } else {
            return this.debugService.provideDebugConfigurations(debugType, workspaceFolderUri);
        }
    }

    async resolveDebugConfiguration(config: DebugConfiguration, workspaceFolderUri: string | undefined): Promise<DebugConfiguration> {
        let resolved = config;

        for (const contributor of this.contributors.values()) {
            if (contributor.resolveDebugConfiguration) {
                try {
                    resolved = await contributor.resolveDebugConfiguration(config, workspaceFolderUri) || resolved;
                } catch (e) {
                    console.error(e);
                }
            }
        }

        return this.debugService.resolveDebugConfiguration(resolved, workspaceFolderUri);
    }

    async getDebuggersForLanguage(language: string): Promise<DebuggerDescription[]> {
        const debuggers = await this.debugService.getDebuggersForLanguage(language);

        for (const contributor of this.contributors.values()) {
            const languages = await contributor.getSupportedLanguages();
            if (languages && languages.indexOf(language) !== -1) {
                debuggers.push(contributor.description);
            }
        }

        return debuggers;
    }

    async getSchemaAttributes(debugType: string): Promise<IJSONSchema[]> {
        const contributor = this.contributors.get(debugType);
        if (contributor) {
            return contributor.getSchemaAttributes();
        } else {
            return this.debugService.getSchemaAttributes(debugType);
        }
    }

    async getConfigurationSnippets(): Promise<IJSONSchemaSnippet[]> {
        let snippets = await this.debugService.getConfigurationSnippets();

        for (const contributor of this.contributors.values()) {
            const contribSnippets = await contributor.getConfigurationSnippets();
            if (contribSnippets) {
                snippets = snippets.concat(contribSnippets);
            }
        }

        return snippets;
    }

    async create(config: DebugConfiguration): Promise<string> {
        const contributor = this.contributors.get(config.type);
        if (contributor) {
            return contributor.createDebugSession(config);
        } else {
            return this.debugService.createDebugSession(config);
        }
    }

    async stop(debugType: string, sessionId: string): Promise<void> {
        const contributor = this.contributors.get(debugType);
        if (contributor) {
            return contributor.terminateDebugSession(sessionId);
        } else {
            return this.debugService.terminateDebugSession(sessionId);
        }
    }

    private async isContributorRegistered(debugType: string): Promise<boolean> {
        const registeredTypes = await this.debugTypes();
        return registeredTypes.indexOf(debugType) !== -1;
    }
}
