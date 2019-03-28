/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import * as React from 'react';
import classNames from 'classnames';
import {
  toggleCheckedSharingOptions,
  attemptToPublish,
  abortUpload,
  resetUploadState,
} from '../../../actions/publish';
import { getProfile, getProfileRootRange } from '../../../selectors/profile';
import {
  getCheckedSharingOptions,
  getFilenameString,
  getDownloadSize,
  getCompressedProfileObjectUrl,
  getSanitizedProfileGeneration,
  getUploadPhase,
  getUploadProgressString,
  getUploadUrl,
  getUploadError,
} from '../../../selectors/publish';
import { assertExhaustiveCheck } from '../../../utils/flow';

import explicitConnect, {
  type ExplicitConnectOptions,
  type ConnectedProps,
} from '../../../utils/connect';

import type { Profile } from '../../../types/profile';
import type { CheckedSharingOptions } from '../../../types/actions';
import type { StartEndRange } from '../../../types/units';
import type { UploadPhase } from '../../../types/state';

require('./Publish.css');

type OwnProps = {||};

type StateProps = {|
  +profile: Profile,
  +rootRange: StartEndRange,
  +checkedSharingOptions: CheckedSharingOptions,
  +downloadSizePromise: Promise<string>,
  +compressedProfileObjectUrlPromise: Promise<string>,
  +sanitizedProfileGeneration: number,
  +downloadFileName: string,
  +uploadPhase: UploadPhase,
  +uploadProgress: string,
  +uploadUrl: string,
  +error: mixed,
|};

type DispatchProps = {|
  +toggleCheckedSharingOptions: typeof toggleCheckedSharingOptions,
  +attemptToPublish: typeof attemptToPublish,
  +abortUpload: typeof abortUpload,
  +resetUploadState: typeof resetUploadState,
|};

type PublishProps = ConnectedProps<OwnProps, StateProps, DispatchProps>;

class MenuButtonsPublishImpl extends React.PureComponent<PublishProps> {
  _toggles: { [$Keys<CheckedSharingOptions>]: () => mixed } = {
    isFiltering: () => this.props.toggleCheckedSharingOptions('isFiltering'),
    hiddenThreads: () =>
      this.props.toggleCheckedSharingOptions('hiddenThreads'),
    timeRange: () => this.props.toggleCheckedSharingOptions('timeRange'),
    screenshots: () => this.props.toggleCheckedSharingOptions('screenshots'),
    urls: () => this.props.toggleCheckedSharingOptions('urls'),
    extension: () => this.props.toggleCheckedSharingOptions('extension'),
  };

  _renderCheckbox(slug: $Keys<CheckedSharingOptions>, label: string) {
    const { checkedSharingOptions } = this.props;
    const isDisabled = !checkedSharingOptions.isFiltering;
    const toggle = this._toggles[slug];
    return (
      <label
        className={classNames({
          'photon-label': true,
          menuButtonsPublishDataChoicesLabel: true,
          disabled: isDisabled,
        })}
      >
        <input
          type="checkbox"
          className="photon-checkbox photon-checkbox-default"
          name={slug}
          disabled={isDisabled}
          onChange={toggle}
          checked={checkedSharingOptions[slug]}
        />
        {label}
      </label>
    );
  }

  _renderPublishPanel() {
    const {
      checkedSharingOptions,
      downloadSizePromise,
      attemptToPublish,
      downloadFileName,
      compressedProfileObjectUrlPromise,
      sanitizedProfileGeneration,
      uploadUrl,
    } = this.props;

    return (
      <div data-testid="MenuButtonsPublish-container">
        {uploadUrl ? (
          <div className="menuButtonsPublishPreviousUrl">
            <div className="menuButtonsPublishPreviousUrlTitle">
              Previously published profile:
            </div>
            <div className="menuButtonsPublishUrl">
              <a href={uploadUrl} target="_blank" rel="noopener noreferrer">
                {uploadUrl}
              </a>
            </div>
          </div>
        ) : null}
        <form className="menuButtonsPublishContent" onSubmit={attemptToPublish}>
          <div className="menuButtonsPublishIcon" />
          <p className="menuButtonsPublishInfoDescription">
            You’re about to share your profile potentially where others have
            public access to it. By default, the profile is stripped of much of
            the personally identifiable information.
          </p>
          <details className="menuButtonsPublishData">
            <summary className="menuButtonsPublishDataSummary">
              Adjust how much is shared{' '}
              <DownloadSize
                generation={sanitizedProfileGeneration}
                downloadSizePromise={downloadSizePromise}
              />
            </summary>
            <label className="photon-label">
              <input
                className="photon-checkbox photon-checkbox-default"
                type="checkbox"
                name="isFiltering"
                onChange={this._toggles.isFiltering}
                checked={checkedSharingOptions.isFiltering}
              />
              Filter out potentially identifying information
            </label>
            <div className="menuButtonsPublishDataChoices">
              {this._renderCheckbox('hiddenThreads', 'Remove hidden threads')}
              {this._renderCheckbox(
                'timeRange',
                'Remove information out of the time range'
              )}
              {this._renderCheckbox('screenshots', 'Remove screenshots')}
              {this._renderCheckbox('urls', 'Remove all URLs')}
              {this._renderCheckbox('extension', 'Remove extensions')}
            </div>
          </details>
          <div className="menuButtonsPublishButtons">
            <DownloadButton
              generation={sanitizedProfileGeneration}
              downloadFileName={downloadFileName}
              compressedProfileObjectUrlPromise={
                compressedProfileObjectUrlPromise
              }
            />
            <button
              type="submit"
              className="photon-button photon-button-primary menuButtonsPublishButton menuButtonsPublishButtonsUpload"
            >
              <span className="menuButtonsPublishButtonsSvg menuButtonsPublishButtonsSvgUpload" />
              Publish
            </button>
          </div>
        </form>
      </div>
    );
  }

  _closePanelAfterUpload = () => {
    const { resetUploadState } = this.props;
    // Only reset it after the panel animation disappears.
    setTimeout(resetUploadState, 300);

    const { body } = document;
    if (body) {
      // This is a hack to close the arrow panel. See the following issue on
      // moving this to the Redux state.
      //
      // https://github.com/firefox-devtools/profiler/issues/1888
      body.dispatchEvent(new MouseEvent('mousedown'));
    }
  };

  _renderUploadPanel() {
    const {
      uploadProgress,
      abortUpload,
      downloadFileName,
      compressedProfileObjectUrlPromise,
      sanitizedProfileGeneration,
    } = this.props;

    return (
      <div
        className="menuButtonsPublishUpload"
        data-testid="MenuButtonsPublish-container"
      >
        <div className="menuButtonsPublishUploadTop">
          <div className="menuButtonsPublishUploadTitle">
            Publishing profile…
          </div>
          <div className="menuButtonsPublishUploadPercentage">
            {uploadProgress}
          </div>
          <div className="menuButtonsPublishUploadBar">
            <div
              className="menuButtonsPublishUploadBarInner"
              style={{ width: uploadProgress }}
            />
          </div>
        </div>
        <div className="menuButtonsPublishButtons">
          <DownloadButton
            generation={sanitizedProfileGeneration}
            downloadFileName={downloadFileName}
            compressedProfileObjectUrlPromise={
              compressedProfileObjectUrlPromise
            }
          />
          <button
            type="button"
            className="photon-button photon-button-default menuButtonsPublishButton menuButtonsPublishButtonsCancelUpload"
            onClick={abortUpload}
          >
            Cancel Upload
          </button>
        </div>
      </div>
    );
  }

  _renderUploadedPanel() {
    const { uploadUrl } = this.props;
    return (
      <div
        className="menuButtonsPublishUpload"
        data-testid="MenuButtonsPublish-container"
      >
        <div className="menuButtonsPublishUploadTop">
          <div className="menuButtonsPublishUploadTitle">Profile published</div>
          <div className="menuButtonsPublishMessage">
            Your profile was published, it is now safe to close this window.
          </div>
          <div className="menuButtonsPublishUrl">
            <a href={uploadUrl} target="_blank" rel="noopener noreferrer">
              {uploadUrl}
            </a>
          </div>
        </div>
        <div className="menuButtonsPublishButtons">
          <button
            type="button"
            className="photon-button photon-button-primary menuButtonsPublishButton"
            onClick={this._closePanelAfterUpload}
          >
            Ok
          </button>
        </div>
      </div>
    );
  }

  _renderErrorPanel() {
    const { error, resetUploadState } = this.props;
    let message: string =
      'There was an unknown error when trying to publish the profile.';
    if (
      error &&
      typeof error === 'object' &&
      'message' in error &&
      typeof error.message === 'string'
    ) {
      // This is most likely an error, but do a runtime check just in case.
      message = error.message;
    } else if (typeof error === 'string') {
      message = error;
    }

    return (
      <div
        className="menuButtonsPublishUpload"
        data-testid="MenuButtonsPublish-container"
      >
        <div className="photon-message-bar photon-message-bar-error">
          Uh oh, something went wrong when publishing the profile.
          <button
            className="photon-button photon-button-micro"
            type="button"
            onClick={resetUploadState}
          >
            Try again
          </button>
        </div>
        <div className="menuButtonsPublishError">{message}</div>
      </div>
    );
  }

  render() {
    const { uploadPhase } = this.props;
    switch (uploadPhase) {
      case 'error':
        return this._renderErrorPanel();
      case 'local':
        return this._renderPublishPanel();
      case 'uploading':
        return this._renderUploadPanel();
      case 'uploaded':
        return this._renderUploadedPanel();
      default:
        throw assertExhaustiveCheck(uploadPhase);
    }
  }
}

const options: ExplicitConnectOptions<OwnProps, StateProps, DispatchProps> = {
  mapStateToProps: state => ({
    profile: getProfile(state),
    rootRange: getProfileRootRange(state),
    checkedSharingOptions: getCheckedSharingOptions(state),
    downloadSizePromise: getDownloadSize(state),
    downloadFileName: getFilenameString(state),
    compressedProfileObjectUrlPromise: getCompressedProfileObjectUrl(state),
    sanitizedProfileGeneration: getSanitizedProfileGeneration(state),
    uploadPhase: getUploadPhase(state),
    uploadProgress: getUploadProgressString(state),
    uploadUrl: getUploadUrl(state),
    error: getUploadError(state),
  }),
  mapDispatchToProps: {
    toggleCheckedSharingOptions,
    attemptToPublish,
    abortUpload,
    resetUploadState,
  },
  component: MenuButtonsPublishImpl,
};
export const MenuButtonsPublish = explicitConnect(options);

type DownloadSizeProps = {|
  // The generation is a number that only increases, and does so each time a profile
  // sanitization option changes, or a new profile is generated. It should be increased
  // any time a new sanitized profile is generated. This is how we know to update
  // this component.
  +generation: number,
  +downloadSizePromise: Promise<string>,
|};

type DownloadSizeState = {|
  prevGeneration: number | null,
  downloadSize: string | null,
|};

/**
 * The DownloadSize handles unpacking the downloadSizePromise. It does
 * so by deriving the state from the props, and utilizing a generation value.
 * See the generation props for a more detailed explanation.
 */
class DownloadSize extends React.PureComponent<
  DownloadSizeProps,
  DownloadSizeState
> {
  _isMounted: boolean = true;

  state = {
    prevGeneration: null,
    downloadSize: null,
  };

  /**
   * The props changed, derive the new state from them. This function will invalidate
   * the previous compressedProfileObjectUrl if the generation is different.
   */
  static getDerivedStateFromProps(
    props: DownloadSizeProps,
    state: DownloadSizeState
  ): null | DownloadSizeState {
    if (props.generation !== state.prevGeneration) {
      // The generation value changed, invalidate the download size.
      return {
        prevGeneration: props.generation,
        downloadSize: null,
      };
    }
    return null;
  }

  _unwrapPromise() {
    const { downloadSizePromise } = this.props;
    downloadSizePromise.then(downloadSize => {
      if (this._isMounted) {
        this.setState({ downloadSize });
      }
    });
  }

  componentDidUpdate() {
    if (this.state.downloadSize === null) {
      this._unwrapPromise();
    }
  }

  componentDidMount() {
    this._isMounted = true;
    this._unwrapPromise();
  }

  componentWillUnmount() {
    this._isMounted = false;
  }

  render() {
    const { downloadSize } = this.state;
    if (downloadSize === null) {
      return null;
    }
    return <span className="menuButtonsDownloadButton">({downloadSize})</span>;
  }
}

type DownloadButtonProps = {|
  // The generation is a number that only increases, and does so each time a profile
  // sanitization option changes, or a new profile is generated. It should be increased
  // any time a new sanitized profile is generated. This is how we know to update
  // this component.
  +generation: number,
  +compressedProfileObjectUrlPromise: Promise<string>,
  +downloadFileName: string,
|};

type DownloadButtonState = {|
  prevGeneration: null | number,
  compressedProfileObjectUrl: string | null,
|};

/**
 * The DownloadButton handles unpacking the compressed profile promise. It does
 * so by deriving the state from the props, and utilizing a generation value.
 * See the generation props for a more detailed explanation.
 */
class DownloadButton extends React.PureComponent<
  DownloadButtonProps,
  DownloadButtonState
> {
  _isMounted: boolean = false;
  state = {
    prevGeneration: null,
    compressedProfileObjectUrl: null,
  };

  /**
   * The props changed, derive the new state from them. This function will invalidate
   * the previous compressedProfileObjectUrl if the generation is different.
   */
  static getDerivedStateFromProps(
    props: DownloadButtonProps,
    state: DownloadButtonState
  ): null | DownloadButtonState {
    if (props.generation !== state.prevGeneration) {
      // The generation value changed, invalidate the compressedProfileObjectUrl.
      return {
        prevGeneration: props.generation,
        compressedProfileObjectUrl: null,
      };
    }
    return null;
  }

  _unwrapPromise() {
    const { compressedProfileObjectUrlPromise } = this.props;
    compressedProfileObjectUrlPromise.then(compressedProfileObjectUrl => {
      if (this._isMounted) {
        this.setState({ compressedProfileObjectUrl });
      }
    });
  }

  componentDidMount() {
    this._isMounted = true;
    this._unwrapPromise();
  }

  componentDidUpdate() {
    if (this.state.compressedProfileObjectUrl === null) {
      this._unwrapPromise();
    }
  }

  componentWillUnmount() {
    this._isMounted = false;
  }

  render() {
    const { downloadFileName } = this.props;
    const { compressedProfileObjectUrl } = this.state;
    const className =
      'photon-button menuButtonsPublishButton menuButtonsPublishButtonsDownload';

    if (compressedProfileObjectUrl) {
      return (
        // This component must be an <a> rather than a <button> as the download attribute
        // allows users to download the profile.
        <a
          href={compressedProfileObjectUrl}
          download={`${downloadFileName}.gz`}
          className={className}
        >
          <span className="menuButtonsPublishButtonsSvg menuButtonsPublishButtonsSvgDownload" />
          Download
        </a>
      );
    }

    return (
      // This component must be an <a> rather than a <button> as the download attribute
      // allows users to download the profile.
      <a type="button" href="#" className={classNames(className, 'disabled')}>
        Compressing…
      </a>
    );
  }
}
