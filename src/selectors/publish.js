/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import { createSelector } from 'reselect';
import {
  getProfile,
  getProfileRootRange,
  getCommittedRange,
  getGlobalTracks,
  getLocalTracksByPid,
} from './profile';
import { compress } from '../utils/gz';
import {
  serializeProfile,
  sanitizePII,
} from '../profile-logic/process-profile';
import prettyBytes from '../utils/pretty-bytes';
import { getHiddenGlobalTracks, getHiddenLocalTracksByPid } from './url-state';
import { ensureExists } from '../utils/flow';
import { formatNumber } from '../utils/format-numbers';

import type { PublishState, UploadState, UploadPhase } from '../types/state';
import type { Selector } from '../types/store';
import type { CheckedSharingOptions } from '../types/actions';
import type { RemoveProfileInformation } from '../types/profile-derived';

export const getPublishState: Selector<PublishState> = state => state.publish;

export const getCheckedSharingOptions: Selector<
  CheckedSharingOptions
> = state => getPublishState(state).checkedSharingOptions;

export const getFilenameString: Selector<string> = createSelector(
  getProfile,
  getProfileRootRange,
  (profile, rootRange) => {
    const { startTime, product } = profile.meta;

    // Pad single digit numbers with a 0.
    const pad = x => (x < 10 ? `0${x}` : `${x}`);

    // Compute the date string.
    const date = new Date(startTime + rootRange.start);
    const year = pad(date.getFullYear());
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const hour = pad(date.getHours());
    const min = pad(date.getMinutes());
    const dateString = `${year}-${month}-${day} ${hour}.${min}`;

    // Return the final file name
    return `${product} ${dateString} profile.json`;
  }
);

export const getRemoveProfileInformation: Selector<RemoveProfileInformation | null> = createSelector(
  getCheckedSharingOptions,
  getProfile,
  getCommittedRange,
  getHiddenGlobalTracks,
  getHiddenLocalTracksByPid,
  getGlobalTracks,
  getLocalTracksByPid,
  (
    checkedSharingOptions,
    profile,
    committedRange,
    hiddenGlobalTracks,
    hiddenLocalTracksByPid,
    globalTracks,
    localTracksByPid
  ) => {
    if (!checkedSharingOptions.isFiltering) {
      return null;
    }

    // Find all of the thread indexes that are hidden.
    const shouldRemoveThreads = new Set();
    if (checkedSharingOptions.hiddenThreads) {
      for (const globalTrackIndex of hiddenGlobalTracks) {
        const globalTrack = globalTracks[globalTrackIndex];
        if (
          globalTrack.type === 'process' &&
          globalTrack.mainThreadIndex !== null
        ) {
          // This is a process thread that has been hidden.
          shouldRemoveThreads.add(globalTrack.mainThreadIndex);
          const localTracks = ensureExists(
            localTracksByPid.get(globalTrack.pid),
            'Expected to be able to get a local track by PID.'
          );

          // Also add all of the children threads, as they are hidden as well.
          for (const localTrack of localTracks) {
            if (localTrack.type === 'thread') {
              shouldRemoveThreads.add(localTrack.threadIndex);
            }
          }
        }
      }

      // Add all of the local tracks that have been hidden.
      for (const [pid, hiddenLocalTrackIndexes] of hiddenLocalTracksByPid) {
        const localTracks = ensureExists(
          localTracksByPid.get(pid),
          'Expected to be able to get a local track by PID'
        );
        for (const hiddenLocalTrackIndex of hiddenLocalTrackIndexes) {
          const localTrack = localTracks[hiddenLocalTrackIndex];
          if (localTrack.type === 'thread') {
            shouldRemoveThreads.add(localTrack.threadIndex);
          }
        }
      }
    }

    return {
      shouldFilterToCommittedRange: checkedSharingOptions.timeRange
        ? committedRange
        : null,
      shouldRemoveNetworkUrls: checkedSharingOptions.urls,
      shouldRemoveAllUrls: checkedSharingOptions.urls,
      shouldRemoveThreadsWithScreenshots: new Set(
        checkedSharingOptions.screenshots
          ? profile.threads.map((_, threadIndex) => threadIndex)
          : []
      ),
      shouldRemoveThreads,
      shouldRemoveExtensions: checkedSharingOptions.extension,
    };
  }
);

/**
 * Computing the compressed data for a profile is a potentially slow operation. This
 * selector and its consumers perform that operation asynchronously. It can be called
 * multiple times while adjust the PII sanitization, but should happen in the background.
 * It happens in the selector so that it can be shared across components and actions.
 *
 * Due to this memoization strategy, one copy of the data is retained in memory and
 * never freed.
 */
export const getSanitizedProfileData: Selector<
  Promise<Uint8Array>
> = createSelector(
  getRemoveProfileInformation,
  getProfile,
  async (removeProfileInformation, profile) => {
    const maybeSanitizedProfile = removeProfileInformation
      ? sanitizePII(profile, removeProfileInformation)
      : profile;
    return compress(serializeProfile(maybeSanitizedProfile));
  }
);

/**
 * The blob is needed for both the download size, and the ObjectURL.
 */
export const getSanitizedProfileBlob: Selector<Promise<Blob>> = createSelector(
  getSanitizedProfileData,
  async profileData =>
    new Blob([await profileData], { type: 'application/octet-binary' })
);

// URL.createObjectURL are not GCed, they must be cleaned up manually. Store a reference
// to the previous object URL here. Only retain the latest one.
let _previousObjectUrl;

/**
 * This selector generates the string that can be downloaded, or uploaded for persisting
 * profiles.
 */
export const getCompressedProfileObjectUrl: Selector<
  Promise<string>
> = createSelector(getSanitizedProfileBlob, async blobPromise => {
  const blob = await blobPromise;
  if (_previousObjectUrl) {
    // Make sure and clean up the previously created object URL so that we
    // don't leak it.
    // https://developer.mozilla.org/en-US/docs/Web/API/URL/revokeObjectURL
    URL.revokeObjectURL(_previousObjectUrl);
  }
  _previousObjectUrl = URL.createObjectURL(blob);
  return _previousObjectUrl;
});

export const getDownloadSize: Selector<Promise<string>> = createSelector(
  getSanitizedProfileBlob,
  blobPromise => blobPromise.then(blob => prettyBytes(blob.size))
);

/**
 * The sanitized profile computation is async. In order to properly invalidate state
 * in React components, use a generation value. This value is an integer that increments
 * any time the PII filtering values change. The consuming component can then derive
 * state from the props to correctly unwrap the promise and use it.
 */
let _sanitizedProfileGeneration = 0;
export const getSanitizedProfileGeneration: Selector<number> = createSelector(
  getRemoveProfileInformation,
  getProfile,
  () => _sanitizedProfileGeneration++
);

export const getUploadState: Selector<UploadState> = state =>
  getPublishState(state).upload;

export const getUploadPhase: Selector<UploadPhase> = state =>
  getUploadState(state).phase;

export const getUploadGeneration: Selector<number> = state =>
  getUploadState(state).generation;

export const getUploadProgress: Selector<number> = state =>
  getUploadState(state).uploadProgress;

export const getUploadUrl: Selector<string> = state =>
  getUploadState(state).url;

export const getUploadError: Selector<Error | mixed> = state =>
  getUploadState(state).error;

export const getUploadProgressString: Selector<string> = createSelector(
  getUploadProgress,
  progress => formatNumber(progress, 0, 0, 'percent')
);

export const getAbortFunction: Selector<() => void> = state =>
  getUploadState(state).abortFunction;
