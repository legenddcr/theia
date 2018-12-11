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

import { injectable, inject, named, postConstruct } from 'inversify';
import { ContributionProvider } from '@theia/core/lib/common/contribution-provider';
import { DebugSessionContribution } from './debug-session-contribution';
import { Disposable } from '@theia/core/lib/common/disposable';

/**
 * Registry for client debug sessions.
 */
@injectable()
export class DebugSessionContributionRegistry {
    protected readonly contribs = new Map<string, DebugSessionContribution>();

    @inject(ContributionProvider) @named(DebugSessionContribution)
    protected readonly contributions: ContributionProvider<DebugSessionContribution>;

    @postConstruct()
    protected init(): void {
        for (const contrib of this.contributions.getContributions()) {
            this.contribs.set(contrib.debugType, contrib);
        }
    }

    get(debugType: string): DebugSessionContribution | undefined {
        return this.contribs.get(debugType);
    }

    registerDebugSessionContribution(debugType: string, contrib: DebugSessionContribution): Disposable {
        if (this.contribs.has(debugType)) {
            console.warn(`Debug session contribution already registered for ${debugType}`);
            return Disposable.NULL;
        }

        this.contribs.set(debugType, contrib);
        return Disposable.create(() => this.unregisterDebugSessionContribution(debugType));
    }

    unregisterDebugSessionContribution(debugType: string): void {
        this.contribs.delete(debugType);
    }
}
