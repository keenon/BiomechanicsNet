import { makeAutoObservable, action } from 'mobx';
import Storage from "@aws-amplify/storage";
import PubSub from "@aws-amplify/pubsub";
import Auth from "@aws-amplify/auth";
import {
    S3ProviderListOutput,
    S3ProviderListOutputItem,
} from "@aws-amplify/storage";
import { ZenObservable } from 'zen-observable-ts';

/// This is a convenience wrapper for mobx-style interaction with ReactiveS3. It's reusable, to avoid memory leaks.
/// Ideally, users of this class create a single one, and re-use it as the GUI traverses over different paths and indexes,
/// by calling setPath() and setIndex(). This should handle cleaning up stray listeners as it traverses, which prevents leaks.
class ReactiveCursor {
    index: ReactiveIndex;
    path: string;
    metadata: ReactiveFileMetadata | null;
    children: Map<string, ReactiveFileMetadata>;

    constructor(index: ReactiveIndex, path: string) {
        this.index = index;
        this.path = '';
        this.metadata = null;
        this.children = new Map();

        makeAutoObservable(this);

        this.setPath(path);
    }

    /**
     * Set the cursor to point at a new file, which will change its state to reflect the state of
     * the new file.
     * 
     * @param path the new path to use
     */
    setPath = (path: string) => {
        if (path === this.path) return;

        // Clean up the old listeners.
        // This is a no-op if the listeners aren't registered
        this.index.removeMetadataListener(this.path, this._metadataListener);
        this.index.removeChildrenListener(this.path, this._onChildrenListener);

        this.path = path;
        this.metadata = this.index.getMetadata(this.path);
        this.children = this.index.getChildren(this.path);

        // Add new listeners for changes at the current path
        this.index.addMetadataListener(this.path, this._metadataListener);
        this.index.addChildrenListener(this.path, this._onChildrenListener);
    };

    /**
     * Set a ReactiveIndex to back this cursor. This handles cleaning up any old listeners we 
     * had pointed at an old index, and creating new ones on the new index.
     * 
     * @param index the new ReactiveIndex to use
     */
    setIndex = (index: ReactiveIndex) => {
        if (index === this.index) return;

        // Clean up the old listeners.
        // This is a no-op if the listeners aren't registered
        this.index.removeMetadataListener(this.path, this._metadataListener);
        this.index.removeChildrenListener(this.path, this._onChildrenListener);

        this.index = index;
        this.metadata = this.index.getMetadata(this.path);
        this.children = this.index.getChildren(this.path);

        // Add new listeners for changes at the current path
        this.index.addMetadataListener(this.path, this._metadataListener);
        this.index.addChildrenListener(this.path, this._onChildrenListener);
    };

    /**
     * @returns True if the file pointed to at "path" exists in S3
     */
    getExists = () => {
        return this.metadata != null;
    };

    /**
     * @param child The child file name to look for
     * @returns the child metadata if the child exists, null otherwise
     */
    getChildMetadata = (child: string) => {
        return this.children.get(child) ?? null;
    };

    /**
     * This computes and returns the children of a given "child" path. If the 
     * child doesn't exist, this will return an empty set of children.
     * 
     * @param childPath the child folder to return the children of
     */
    getChildrenOf = (childPath: string) => {
        if (!childPath.startsWith("/")) childPath = childPath + "/";

        let subChildren: Map<string, ReactiveFileMetadata> = new Map();
        this.children.forEach((file, path) => {
            if (path.startsWith(childPath)) {
                let subPath = path.substring(childPath.length);
                subChildren.set(subPath, file);
            }
        });

        return subChildren;
    };

    /**
     * This computes synthetic ReactiveFileMetadata objects for each folder, 
     * by summing the sizes of the child files that lie within that folder, and 
     * taking the most recent modification time.
     */
    getImmediateChildFolders = () => {
        let folders: Map<string, ReactiveFileMetadata> = new Map();
        this.children.forEach((file: ReactiveFileMetadata, relativePath: string) => {
            let parts = relativePath.split('/');
            let existingFolder: ReactiveFileMetadata | undefined = folders.get(parts[0]);
            if (existingFolder == null) {
                // Create a folder to contain just this object
                folders.set(parts[0], {
                    key: parts[0],
                    lastModified: file.lastModified,
                    size: file.size
                });
            }
            else {
                // Add our size to the folder, and update the lastModified
                folders.set(parts[0], {
                    key: parts[0],
                    lastModified: file.lastModified > existingFolder.lastModified ? file.lastModified : existingFolder.lastModified,
                    size: file.size + existingFolder.size
                });
            }
        });
        return [...folders.values()].sort();
    };

    /**
     * Returns true if all the childNames exist as files (or are implied by path names as virtual folders)
     * 
     * @param childNames A list of child paths to check for existence
     */
    hasChildren = (childNames: string[]) => {
        let existingChildNames: string[] = [...this.children.keys()];

        for (let i = 0; i < childNames.length; i++) {
            let foundMatch = false;
            for (let j = 0; j < existingChildNames.length; j++) {
                if (childNames[i].startsWith(existingChildNames[j])) {
                    let remainingPath = childNames[i].substring(existingChildNames[j].length);
                    if (remainingPath.length === 0 || remainingPath.charAt(0) === '/' || childNames[i].endsWith('/')) {
                        foundMatch = true;
                        break;
                    }
                }
            }
            if (!foundMatch) return false;
        }

        return true;
    };

    /**
     * Returns true if the folder at `childPath` has the children `grandchildNames`
     * 
     * This is a convenience method to concatente the childPath with each grandchildName, and pass that to this.hasChildren()
     * 
     * @param childPath 
     * @param grandchildNames 
     */
    childHasChildren = (childPath: string, grandchildNames: string[]) => {
        if (!childPath.endsWith("/")) childPath += "/";
        let concatenated: string[] = [];
        for (let i = 0; i < grandchildNames.length; i++) {
            concatenated.push(childPath + grandchildNames[i]);
        }
        return this.hasChildren(concatenated);
    };

    /**
     * Tries to upload to the file we're currently pointing at
     * @returns a promise for successful upload
     */
    upload = (contents: File | string, progressCallback: (percentage: number) => void = () => { }) => {
        return this.index.upload(this.path, contents, progressCallback);
    };

    /**
     * Tries to upload to the file we're currently pointing at
     * @returns a promise for successful upload
     */
    uploadChild = (childPath: string, contents: File | string, progressCallback: (percentage: number) => void = () => { }) => {
        let myPath = this.path;
        if (!myPath.endsWith("/")) {
            myPath += "/";
        }

        return this.index.upload(myPath + childPath, contents, progressCallback);
    };

    /**
     * Tries to delete the file we're currently pointing at, which fails if it doesn't exist.
     * @returns a promise for successful deletion
     */
    delete = () => {
        return this.index.delete(this.path);
    };

    /**
     * Tries to delete the file we're currently pointing at, which fails if it doesn't exist.
     * @returns a promise for successful deletion
     */
    deleteChild = (childPath: string) => {
        let myPath = this.path;
        if (!myPath.endsWith("/")) {
            myPath += "/";
        }

        return this.index.delete(myPath + childPath);
    };

    _metadataListener = (file: ReactiveFileMetadata | null) => {
        this.metadata = file;
    };

    _onChildrenListener = (children: Map<string, ReactiveFileMetadata>) => {
        this.children = children;
    };
}

/// This holds the low-level copy of the S3 output, without nulls
type ReactiveFileMetadata = {
    key: string;
    lastModified: Date;
    size: number;
}

/// This is the low-level API that interacts directly with S3 and PubSub to keep up to date.
class ReactiveIndex {
    files: Map<string, ReactiveFileMetadata> = new Map();

    // This is the name of the S3 bucket we're using
    bucket: string;
    // This is the level, in the Amplify API's, of storage this index is reflecting
    level: 'protected' | 'public';
    // This is the prefix that's getting attached (invisibly) to the paths we send to Amplify
    // before they get forwarded to S3
    globalPrefix: string = '';

    metadataListeners: Map<string, Array<(metadata: ReactiveFileMetadata | null) => void>> = new Map();

    childrenListeners: Map<string, Array<(children: Map<string, ReactiveFileMetadata>) => void>> = new Map();
    childrenLastNotified: Map<string, Map<string, ReactiveFileMetadata>> = new Map();

    // This listens for updates to the files in this folder, and then re-fetches files as we're notified of changes to them.
    pubsubUpdateListener: ZenObservable.Subscription | null = null;
    pubsubDeleteListener: ZenObservable.Subscription | null = null;

    constructor(bucket: string, level: 'protected' | 'public', runNetworkSetup: boolean = true) {
        this.bucket = bucket;
        this.level = level;

        // We don't want to run network setup in our unit tests
        if (runNetworkSetup) {
            if (level == 'public') {
                this.globalPrefix = 'public/';
                this.fullRefresh();
                this.registerPubSubListeners();
            }
            else if (level == 'protected') {
                Auth.currentCredentials().then((credentials) => {
                    this.globalPrefix = "protected/" + credentials.identityId + "/";
                    this.fullRefresh();
                    this.registerPubSubListeners();
                });
            }
        }
    }

    /**
     * This uploads a file to the server, and notifies PubSub of having done so.
     * 
     * @param path the path to upload to
     * @param contents the contents to upload
     * @param progressCallback OPTIONAL: a callback to receive with updates on upload progress
     * @returns a promise that resolves when the full operation is complete
     */
    upload = (path: string, contents: File | string, progressCallback: (percentage: number) => void = () => { }) => {
        const fullPath = this.globalPrefix + path;
        const updatedFile: ReactiveFileMetadata = {
            key: path,
            lastModified: new Date(), // = now
            size: new Blob([contents]).size
        };
        return new Promise(
            (resolve: (value: void) => void, reject: (reason?: any) => void) => {
                Storage.put(path, contents, {
                    level: this.level,
                    progressCallback: (progress) => {
                        progressCallback(progress.loaded / progress.total);
                    },
                    completeCallback: action(() => {
                        progressCallback(1.0);
                        PubSub.publish("/UPDATE/" + fullPath, updatedFile).then(() => resolve());
                    }),
                })
                    .then(() => {
                        progressCallback(1.0);
                        PubSub.publish("/UPDATE/" + fullPath, updatedFile).then(() => resolve());
                    })
                    .catch((e) => {
                        reject(e);
                    });
            }
        );
    }

    /**
     * This attempts to delete a file in S3, and notify PubSub of having done so.
     * 
     * @param path The file to delete
     * @returns a promise that resolves when the full operation is complete
     */
    delete = (path: string) => {
        const fullPath = this.globalPrefix + path;
        return Storage.remove(path, { level: this.level })
            .then(() => {
                return PubSub.publish("/DELETE/" + fullPath, { key: fullPath });
            });
    }

    /**
     * @returns A signed URL that someone could use to download a file
     */
    getSignedURL = (path: string) => {
        return Storage.get(path, {
            level: this.level,
        });
    };

    /**
     * This actually downloads a file from S3, if the browser allows it
     */
    downloadFile = (path: string) => {
        return Storage.get(path, {
            level: this.level,
        }).then((signedURL) => {
            const link = document.createElement("a");
            link.href = signedURL;
            link.target = "#";
            link.click();
        });
    };

    /**
     * This downloads and parses a file into a string, and returns it
     * 
     * @returns A promise for the text of the file being downloaded
     */
    downloadText = (path: string) => {
        return Storage.get(path, {
            level: this.level,
            download: true,
            cacheControl: "no-cache",
        }).then((result) => {
            if (result != null && result.Body != null) {
                // data.Body is a Blob
                return (result.Body as Blob).text().then((text: string) => {
                    return text;
                });
            }
            throw new Error(
                'Result of downloading "' + path + "\" didn't have a Body"
            );
        });
    };

    /**
     * This gets called when we detect a file at a given path is deleted. It removes the file from the 
     * index, and calls any waiting listeners.
     * 
     * @private
     * @param path 
     */
    _deleteFileInIndex = (path: string) => {
        this.files.delete(path);
        // call metadata listeners to alert them the file doesn't exist anymore
        const existListeners = this.metadataListeners.get(path) ?? [];
        for (let listener of existListeners) {
            listener(null);
        }
        // call child listeners
        this._updateChildListeners();
    };

    /**
     * This gets called when a file was created or updated. Because S3 is only eventually consistent and 
     * PubSub is slow, this may get called with an older copy of the file, so we have to ignore updates 
     * that are older than the current files.
     * 
     * @private
     * @param file 
     */
    _updateFileInIndex = (file: ReactiveFileMetadata) => {
        const existingFile: ReactiveFileMetadata | undefined = this.files.get(file.key);
        // If the file doesn't exist, or this update has a later timestamp, update and replace
        if (existingFile == null || existingFile.lastModified < file.lastModified) {
            this.files.set(file.key, file);
            // call creation/update listeners
            const updateListeners = this.metadataListeners.get(file.key) ?? [];
            for (let listener of updateListeners) {
                listener(file);
            }
            // call child listeners
            this._updateChildListeners();
        }
    };

    /**
     * This goes through and computes whether we need to notify any should child listeners of changes.
     */
    _updateChildListeners = () => {
        this.childrenListeners.forEach((listeners, key: string) => {
            let children = this.getChildren(key);

            if (JSON.stringify([...(this.childrenLastNotified.get(key) ?? new Map())].sort()) !== JSON.stringify([...children].sort())) {
                for (let listener of listeners) {
                    listener(children);
                }
            }

            this.childrenLastNotified.set(key, children);
        });
    };

    /**
     * Gets called when PubSub receives an "/UPDATE/#" message. This is broken out as a separate function to make testing easier.
     * 
     * @param file 
     */
    _onReceivedPubSubUpdate = (file: ReactiveFileMetadata) => {
        this._updateFileInIndex(file);
    };

    /**
     * Gets called when PubSub receives an "/DELETE/#" message. This is broken out as a separate function to make testing easier.
     * 
     * @param file 
     */
    _onReceivedPubSubDelete = (file: { key: string }) => {
        this._deleteFileInIndex(file.key);
    };

    /**
     * This does a complete refresh, overwriting the paths
     */
    fullRefresh = () => {
        // 1. Make the remote API call to list all the objects in this bucket
        return Storage.list(this.bucket, { level: this.level })
            .then(
                (result: S3ProviderListOutput) => {
                    // 2. Update the set of files

                    // 2.1. Build a map of the updated set of objects
                    const newFiles: Map<string, S3ProviderListOutputItem> = new Map();
                    for (let i = 0; i < result.length; i++) {
                        const key = result[i].key;
                        if (key != null) {
                            newFiles.set(key, result[i]);
                        }
                    }

                    // 2.2. For each existing key in our current files, check if it doesn't
                    // exist in the updated set. If it doesn't, then it's been deleted.
                    this.files.forEach((file: ReactiveFileMetadata, path: string) => {
                        if (!newFiles.has(path)) {
                            // This means that "path" was deleted!
                            this._deleteFileInIndex(path);
                        }
                    });

                    newFiles.forEach((file: S3ProviderListOutputItem, path: string) => {
                        const key = file.key;
                        const lastModified = file.lastModified;
                        const size = file.size;
                        if (key != null && lastModified != null && size != null) {
                            this._updateFileInIndex({
                                key,
                                lastModified,
                                size
                            });
                        }
                    })
                }
            )
            .catch((err: Error) => {
                console.error('Unable to refresh folder "' + this.bucket + '"');
                console.log(err);
            });
    };

    /**
     * This registers a PubSub listener for live change-updates on our S3 index
     */
    registerPubSubListeners = () => {
        console.log("Registering PubSub listeners");

        if (this.pubsubUpdateListener != null && !this.pubsubUpdateListener.closed) {
            this.pubsubUpdateListener.unsubscribe();
        }
        if (this.pubsubDeleteListener != null && !this.pubsubDeleteListener.closed) {
            this.pubsubDeleteListener.unsubscribe();
        }

        this.pubsubUpdateListener = PubSub.subscribe("/UPDATE/" + this.globalPrefix + "#").subscribe({
            next: (msg) => {
                const globalKey: string = msg.value.key;
                const key: string = globalKey.substring(this.globalPrefix.length);
                const lastModified: Date = new Date(msg.value.lastModified);
                const size: number = msg.value.size;
                this._onReceivedPubSubUpdate({
                    key, lastModified, size
                });
            },
            error: (error) => {
                console.error("Error on PubSub.subscribe()");
                console.error(error);
            },
            complete: () => console.log("Done"),
        });
        this.pubsubDeleteListener = PubSub.subscribe("/DELETE/" + this.globalPrefix + "#").subscribe({
            next: (msg) => {
                const globalKey: string = msg.value.key;
                const key: string = globalKey.substring(this.globalPrefix.length);
                this._onReceivedPubSubDelete({ key });
            },
            error: (error) => {
                console.error("Error on PubSub.subscribe()");
                console.error(error);
            },
            complete: () => console.log("Done"),
        });
    };

    /**
     * This returns true if a file exists, and false if it doesn't.
     * 
     * @param path The exact path to check
     * @returns the FileMetadata for this file, or null if it doesn't exist
     */
    getMetadata = (path: string) => {
        return this.files.get(path) ?? null;
    };

    /**
     * Fires whenever the file is created, deleted, or updated
     * 
     * @param path The path to listen to
     * @param onUpdate Fires whenever a path is created, or deleted
     */
    addMetadataListener = (path: string, onUpdate: (exists: ReactiveFileMetadata | null) => void) => {
        if (!this.metadataListeners.has(path)) {
            this.metadataListeners.set(path, []);
        }
        this.metadataListeners.get(path)?.push(onUpdate);
    };

    /**
     * This cleans up a listener. This is good to call to avoid memory leaks, since listeners can 
     * hold references to other objects.
     * 
     * @param path 
     * @param onUpdate 
     */
    removeMetadataListener = (path: string, onUpdate: (exists: ReactiveFileMetadata | null) => void) => {
        const index: number = this.metadataListeners.get(path)?.indexOf(onUpdate) ?? -1;
        if (index != -1) {
            this.metadataListeners.get(path)?.splice(index, 1);
        }
    };

    /**
     * This computes the set of all child files.
     * 
     * @param path The folder path
     * @returns A map where keys are sub-paths, and values are file information
     */
    getChildren = (path: string) => {
        if (!path.endsWith('/')) path = path + '/';

        let children: Map<string, ReactiveFileMetadata> = new Map();

        this.files.forEach((file: ReactiveFileMetadata, key: string) => {
            if (key.startsWith(path) && key != path) {
                let suffix = key.substring(path.length);
                children.set(suffix, file);
            }
        });

        return children;
    };

    /**
     * Fires whenever the set of children of a given path changes (either added or deleted)
     * 
     * @param path The folder path to listen for
     */
    addChildrenListener = (path: string, onChange: (children: Map<string, ReactiveFileMetadata>) => void) => {
        if (!this.childrenListeners.has(path)) {
            this.childrenListeners.set(path, []);
        }
        this.childrenListeners.get(path)?.push(onChange);
    };

    /**
     * This cleans up a listener. This is good to call to avoid memory leaks, since listeners can 
     * hold references to other objects.
     * 
     * @param path 
     * @param onChange
     */
    removeChildrenListener = (path: string, onChange: (children: Map<string, ReactiveFileMetadata>) => void) => {
        const index: number = this.childrenListeners.get(path)?.indexOf(onChange) ?? -1;
        if (index != -1) {
            this.childrenListeners.get(path)?.splice(index, 1);
        }
    };

    /**
     * This is useful for detecting memory leaks.
     * 
     * @returns The total number of registered existence listeners
     */
    getNumMetadataListeners = () => {
        let count = [0];
        this.metadataListeners.forEach(l => {
            count[0] += l.length;
        });
        return count[0];
    }

    /**
     * This is useful for detecting memory leaks.
     * 
     * @returns The total number of registered children listeners
     */
    getNumChildrenListeners = () => {
        let count = [0];
        this.childrenListeners.forEach(l => {
            count[0] += l.length;
        });
        return count[0];
    }
}

export { ReactiveIndex, ReactiveCursor, ReactiveFileMetadata };