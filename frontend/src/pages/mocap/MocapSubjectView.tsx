import React, { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { observer } from "mobx-react-lite";
import "./MocapView.scss";
import {
  Button,
  ButtonGroup,
  Dropdown,
  Spinner,
  Table,
  OverlayTrigger,
  Tooltip
} from "react-bootstrap";
import DropFile from "../../components/DropFile";
import Dropzone from "react-dropzone";
import MocapTrialModal from "./MocapTrialModal";
import MocapLogModal from "./MocapLogModal";
import MocapS3Cursor from '../../state/MocapS3Cursor';

type ProcessingResultsJSON = {
  autoAvgMax: number;
  autoAvgRMSE: number;
  goldAvgMax: number;
  goldAvgRMSE: number;
};

type MocapTrialRowViewProps = {
  index: number;
  name: string;
  cursor: MocapS3Cursor;
  showViewerHint: boolean;
  hideViewerHint: () => void;
  uploadC3D: File | undefined;
  uploadTRC: File | undefined;
  uploadGRF: File | undefined;
  uploadIK: File | undefined;
  onMultipleManualIK: (files: File[]) => void;
  onMultipleGRF: (files: File[]) => void;
};

const MocapTrialRowView = observer((props: MocapTrialRowViewProps) => {
  const navigate = useNavigate();
  let manualIKRow = null;
  if (props.cursor.getShowValidationControls()) {
    manualIKRow = (
      <td>
        <DropFile cursor={props.cursor} text={"Upload gold IK as a *.mot or *.sto"} path={"trials/" + props.name + "/manual_ik.mot"} uploadOnMount={props.uploadIK} accept=".mot,.sto" onMultipleFiles={props.onMultipleManualIK} />
      </td>
    );
  }
  let fileData = null;

  let trcMetadata = props.cursor.rawCursor.getChildMetadata("trials/" + props.name + "/markers.trc");
  if (trcMetadata != null || props.uploadTRC != null) {
    fileData = <>
      <td>
        <DropFile cursor={props.cursor} path={"trials/" + props.name + "/markers.trc"} uploadOnMount={props.uploadTRC} accept=".trc,.sto" required />
      </td>
      <td>
        <DropFile cursor={props.cursor} text={"Upload ground reaction forces as a *.mot or *.sto"} path={"trials/" + props.name + "/grf.mot"} uploadOnMount={props.uploadGRF} accept=".mot,.sto" onMultipleFiles={props.onMultipleGRF} />
      </td>
    </>
  }
  else {
    fileData = (
      <td colSpan={2}>
        <DropFile cursor={props.cursor} path={"trials/" + props.name + "/markers.c3d"} uploadOnMount={props.uploadC3D} accept=".c3d" required />
      </td>
    );
  }

  let nameLink;
  if (props.showViewerHint) {
    nameLink =
      <div ref={(r: HTMLDivElement | null) => {
        if (r != null) {
          console.log(r);
          const rect = r.getBoundingClientRect();
          window.scrollTo({
            top: rect.top - 40 + window.scrollY,
            left: rect.left + window.scrollX,
            behavior: 'smooth'
          });
        }
      }} className="MocapView__link_tip_holder">
        <Link
          to={{
            search: "?show-trial=" + props.index,
          }}
          replace
          onClick={() => {
            props.hideViewerHint();
          }}
        >
          {props.name}
        </Link>
        <div className="MocapView__link_tip">
          <i className="mdi mdi-eye me-1 vertical-middle"></i>
          <b>Tip:</b> Click on a trial name to view it in the 3D viewer
        </div>
      </div>;
  }
  else {
    nameLink =
      <Link
        to={{
          search: "?show-trial=" + props.index,
        }}
        replace
        onClick={() => {
          props.hideViewerHint();
        }}
      >
        {props.name}
      </Link>;
  }

  return (
    <tr>
      <td>
        {nameLink}
      </td>
      {fileData}
      {manualIKRow}
      {!props.cursor.canEdit() ? null : (
        <td>
          <ButtonGroup className="d-block mb-2">
            <Dropdown>
              <Dropdown.Toggle className="table-action-btn dropdown-toggle arrow-none btn btn-light btn-xs">
                <i className="mdi mdi-dots-horizontal"></i>
              </Dropdown.Toggle>
              <Dropdown.Menu>
                <Dropdown.Item
                  onClick={() => {
                    navigate({
                      search: "?show-trial=" + props.index,
                    });
                  }}
                >
                  <i className="mdi mdi-eye me-2 text-muted vertical-middle"></i>
                  Preview
                </Dropdown.Item>
                <Dropdown.Item
                  onClick={() => {
                    props.cursor.rawCursor.deleteByPrefix("trials/" + props.name);
                    props.cursor.rawCursor.deleteChild("trials/" + props.name);
                  }}
                >
                  <i className="mdi mdi-delete me-2 text-muted vertical-middle"></i>
                  Delete
                </Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown>
          </ButtonGroup>
        </td>
      )}
    </tr>
  );
});

type MocapSubjectViewProps = {
  cursor: MocapS3Cursor;
};

function getChildByType(node: Node, type: string): Node | null {
  for (let i = 0; i < node.childNodes.length; i++) {
    let childNode = node.childNodes[i];
    if (childNode.nodeType === Node.TEXT_NODE) {
      // Skip these
    }
    else if (childNode.nodeName === type) {
      return childNode;
    }
  }
  return null;
}

function countChildrenByType(node: Node, type: string): number {
  let count = 0;
  for (let i = 0; i < node.childNodes.length; i++) {
    let childNode = node.childNodes[i];
    if (childNode.nodeType === Node.TEXT_NODE) {
      // Skip these
    }
    else if (childNode.nodeName === type) {
      count++;
    }
  }
  return count;
}

function getChildrenByType(node: Node, type: string): Node[] {
  let nodes: Node[] = [];
  for (let i = 0; i < node.childNodes.length; i++) {
    let childNode = node.childNodes[i];
    if (childNode.nodeType === Node.TEXT_NODE) {
      // Skip these
    }
    else if (childNode.nodeName === type) {
      nodes.push(childNode);
    }
  }
  return nodes;
}

function getNotTextChildren(node: Node): Node[] {
  let nodes: Node[] = [];
  for (let i = 0; i < node.childNodes.length; i++) {
    let childNode = node.childNodes[i];
    if (childNode.nodeType === Node.TEXT_NODE) {
      // Skip these
    }
    else {
      nodes.push(childNode);
    }
  }
  return nodes;
}

function getJointError(joint: Node): string | null {
  let jointChildren = getNotTextChildren(joint);
  if (jointChildren.length === 1) {
    let specificJoint = jointChildren[0];
    if (specificJoint.nodeName === 'CustomJoint') {
      let customJoint = specificJoint;

      let spatialTransform = getChildByType(customJoint, "SpatialTransform");
      if (spatialTransform != null) {
        const transformChildren = getChildrenByType(spatialTransform, "TransformAxis");
        for (let i = 0; i < transformChildren.length; i++) {
          const transformAxis = transformChildren[i];

          let func = getChildByType(transformAxis, "function");
          // On v3 files, there is no "function" wrapper tag
          if (func == null) {
            func = transformAxis;
          }

          let linearFunction = getChildByType(func, "LinearFunction");
          let simmSpline = getChildByType(func, "SimmSpline");
          let polynomialFunction = getChildByType(func, "PolynomialFunction");
          let constant = getChildByType(func, "Constant");
          let multiplier = getChildByType(func, "MultiplierFunction");

          if (linearFunction == null && simmSpline == null && polynomialFunction == null && constant == null && multiplier == null) {
            console.log(spatialTransform);
            return "This OpenSim file has a <CustomJoint> with an unsupported function type in its <TransformAxis>. Currently supported types are <LinearFunction>, <SimmSpline>, <PolynomialFunction>, <Constant>, and <MultiplierFunction>. Anything else will lead to a crash during processing.";
          }
        }
      }
      else {
        return "This OpenSim file has a <CustomJoint> with no <SpatialTransform> tag as a child.";
      }
    }
    else if (specificJoint.nodeName === 'WeldJoint') {
      // These are fine, nothing to verify
      // let weldJoint = getChildByType(joint, "WeldJoint");
    }
    else if (specificJoint.nodeName === 'PinJoint') {
      // These are fine, nothing to verify
      // let pinJoint = getChildByType(joint, "PinJoint");
    }
    else if (specificJoint.nodeName === 'UniversalJoint') {
      // These are fine, nothing to verify
      // let universalJoint = getChildByType(joint, "UniversalJoint");
    }
    else {
      return "This OpenSim file has a Joint type we don't yet support: <" + specificJoint.nodeName + ">. The currently supported types are <CustomJoint>, <WeldJoint>, <PinJoint>, and <UniversalJoint>";
    }
  }
  return null;
}

function validateOpenSimFile(file: File): Promise<null | string> {
  return new Promise<null | string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e: any) => {
      const text: string = e.target.result;
      const parser = new DOMParser();
      const xmlDoc: Document = parser.parseFromString(text, "text/xml");

      let rootNode: Node = xmlDoc.getRootNode();
      if (rootNode.nodeName === '#document') {
        rootNode = rootNode.childNodes[0];
      }
      if (rootNode.nodeName !== "OpenSimDocument") {
        resolve("Malformed *.osim file! Root node of XML file isn't an <OpenSimDocument>, instead it's <" + rootNode.nodeName + ">");
        return;
      }
      const modelNode = getChildByType(rootNode, "Model");
      if (modelNode == null) {
        resolve("Malformed *.osim file! There isn't a <Model> tag as a child of the <OpenSimDocument>");
        return;
      }

      const bodySet = getChildByType(modelNode, "BodySet");
      if (bodySet == null) {
        resolve("This OpenSim file is missing a BodySet! No <BodySet> tag found");
        return;
      }
      const bodySetObjects = getChildByType(bodySet, "objects");
      if (bodySetObjects == null) {
        resolve("This OpenSim file is missing an <objects> child tag inside the <BodySet> tag!");
        return;
      }
      const bodyNodes = getChildrenByType(bodySetObjects, "Body");
      for (let i = 0; i < bodyNodes.length; i++) {
        const bodyNode = bodyNodes[i];

        // Check the attached geometry
        const attachedGeometry = getChildByType(bodyNode, "attached_geometry");
        if (attachedGeometry != null) {
          const meshes = getChildrenByType(attachedGeometry, "Mesh");
          for (let j = 0; j < meshes.length; j++) {
            const mesh = meshes[j];
            const meshFile = getChildByType(mesh, "mesh_file");
            if (meshFile != null && meshFile.textContent != null) {
              const meshName: string = meshFile.textContent;
              console.log(meshName);
            }
          }
        }

        // Check if joints are attached, and if so check that they're supported and won't crash the backend
        const joint = getChildByType(bodyNode, "Joint");
        if (joint != null) {
          const jointError = getJointError(joint);
          if (jointError != null) {
            resolve(jointError);
            return;
          }
        }
      }

      // This can be null in newer OpenSim files
      const jointSet = getChildByType(modelNode, "JointSet");
      if (jointSet != null) {
        const jointSetObjects = getChildByType(jointSet, "objects");
        if (jointSetObjects == null) {
          resolve("This OpenSim file is missing a <objects> tag under its <JointSet> tag.");
          return;
        }

        const joints = getChildrenByType(jointSetObjects, "Joint");
        for (let i = 0; i < joints.length; i++) {
          const jointError = getJointError(joints[i]);
          if (jointError != null) {
            resolve(jointError);
            return;
          }
        }
      }

      const markerSet = getChildByType(modelNode, "MarkerSet");
      if (markerSet == null) {
        console.log(rootNode);
        resolve("This OpenSim file is missing a MarkerSet! No <MarkerSet> tag found");
        return;
      }

      const markerSetObjects = getChildByType(markerSet, "objects");
      if (markerSetObjects == null) {
        resolve("You're trying to upload a file that doesn't have any markers! This OpenSim file is missing a <objects> list inside its <MarkerSet> tag");
        return;
      }

      let numMarkers = countChildrenByType(markerSetObjects, "Marker");
      if (numMarkers < 5) {
        resolve("You're trying to upload a file with " + numMarkers + " <Marker> descriptions inside the <MarkerSet> tag. Please ensure you specify your whole markerset in your OpenSim files.");
        return;
      }

      // If none of the other checks tripped, then we're good to go!
      resolve(null);
    }
    reader.readAsText(file);
  });
}

const MocapSubjectView = observer((props: MocapSubjectViewProps) => {
  const [uploadFiles, setUploadFiles] = useState({} as { [key: string]: File; });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showViewerHint, setShowViewerHint] = useState(false);
  const navigate = useNavigate();

  let trialViews: any[] = [];

  let trials = props.cursor.getTrials();
  for (let i = 0; i < trials.length; i++) {
    trialViews.push(
      <MocapTrialRowView
        cursor={props.cursor}
        index={i}
        key={trials[i].key}
        name={trials[i].key}
        showViewerHint={i == 0 && showViewerHint}
        hideViewerHint={() => setShowViewerHint(false)}
        uploadC3D={uploadFiles[trials[i].key + ".c3d"]}
        uploadTRC={uploadFiles[trials[i].key + ".trc"]}
        uploadGRF={uploadFiles[trials[i].key + "_grf.mot"]}
        uploadIK={uploadFiles[trials[i].key + "_ik.mot"]}
        onMultipleManualIK={(files: File[]) => {
          // This allows us to store that we'd like to auto-upload these files once the trials with matching names are created
          let updatedUploadFiles = { ...uploadFiles };
          for (let i = 0; i < files.length; i++) {
            updatedUploadFiles[files[i].name.replace(".mot", "_ik.mot").replace(".sto", "_ik.mot")] = files[i];
          }
          setUploadFiles(updatedUploadFiles);
        }}
        onMultipleGRF={(files: File[]) => {
          // This allows us to store that we'd like to auto-upload these files once the trials with matching names are created
          let updatedUploadFiles = { ...uploadFiles };
          for (let i = 0; i < files.length; i++) {
            updatedUploadFiles[files[i].name.replace(".mot", "_grf.mot").replace(".sto", "_grf.mot")] = files[i];
          }
          setUploadFiles(updatedUploadFiles);
        }}
      />
    );
  }
  if (props.cursor.canEdit()) {
    trialViews.push(
      <tr key="upload">
        <td colSpan={6}>
          <Dropzone
            {...props}
            accept=".c3d,.mot,.trc,.sto"
            onDrop={(acceptedFiles) => {
              // This allows us to store that we'd like to auto-upload these files once the trials with matching names are created
              let updatedUploadFiles = { ...uploadFiles };
              let fileNames: string[] = [];
              for (let i = 0; i < acceptedFiles.length; i++) {
                fileNames.push(acceptedFiles[i].name);
                updatedUploadFiles[acceptedFiles[i].name] = acceptedFiles[i];

                if (!acceptedFiles[i].name.endsWith(".c3d") && !acceptedFiles[i].name.endsWith(".trc")) {
                  alert("You can only bulk create trials with *.c3d or *.trc files. To bulk upload other types of files (like *.mot or *.sto for IK) please create the trials first, then drag a group of *.mot or *.sto files to one of the IK upload slots (doesn't matter which trial, files will be matched by name).");
                  return;
                }
              }
              setUploadFiles(updatedUploadFiles);
              props.cursor.bulkCreateTrials(fileNames);
            }}
          >
            {({ getRootProps, getInputProps, isDragActive }) => {
              const rootProps = getRootProps();
              const inputProps = getInputProps();
              return <div className={"dropzone" + (isDragActive ? ' dropzone-hover' : '')} {...rootProps}>
                <div className="dz-message needsclick">
                  <input {...inputProps} />
                  <i className="h3 text-muted dripicons-cloud-upload"></i>
                  <h5>
                    Drop C3D or TRC files here (or just click here) to bulk upload trials.
                  </h5>
                  <span className="text-muted font-13">
                    (You can drop multiple files at once to create multiple
                    trials simultaneously)
                  </span>
                </div>
              </div>
            }}
          </Dropzone>
        </td>
      </tr>
    );
  }

  let showValidationControls = props.cursor.getShowValidationControls();

  let manuallyScaledOpensimUpload = null;
  let manualIkRowHeader = null;
  if (showValidationControls) {
    manuallyScaledOpensimUpload = (
      <div>
        <h5>Manually Scaled OpenSim</h5>
        <DropFile cursor={props.cursor} path={"manually_scaled.osim"} accept=".osim" validateFile={validateOpenSimFile} />
      </div>
    );
    manualIkRowHeader = (
      <th className="border-0">Gold IK</th>
    );
  }

  let weightValue = props.cursor.subjectJson.getAttribute("massKg", 0.0);
  let heightValue = props.cursor.subjectJson.getAttribute("heightM", 0.0);
  let sexValue = props.cursor.subjectJson.getAttribute("sex", "unknown");

  let autoAvgRMSE = props.cursor.resultsJson.getAttribute("autoAvgRMSE", 0.0);
  let guessedTrackingMarkers = props.cursor.resultsJson.getAttribute("guessedTrackingMarkers", 0.0);
  let trialMarkerSets = props.cursor.resultsJson.getAttribute("trialMarkerSets", {});
  let osimMarkers: string[] = props.cursor.resultsJson.getAttribute("osimMarkers", {});

  let status: 'done' | 'processing' | 'could-process' | 'error' | 'waiting' | 'empty' = props.cursor.getSubjectStatus();
  let statusBadge = null;
  let statusDetails = null;
  if (status === "done") {
    let download = null;
    if (props.cursor.hasResultsArchive()) {
      download = (
        <div style={{ 'marginBottom': '5px' }}>
          <Button onClick={() => props.cursor.downloadResultsArchive()}>
            <i className="mdi mdi-download me-2 vertical-middle"></i>
            Download OpenSim Results
          </Button>
        </div>
      );
    }

    let warningList = [];

    if (guessedTrackingMarkers == true) {
      let markerText = '<Marker name="RSH">';
      markerText += '\n  <socket_parent_frame>/bodyset/torso</socket_parent_frame>';
      markerText += '\n  <location> -0.03 0.42 0.15 </location>';
      let markerText2 = '  <fixed>true</fixed>';
      let markerText3 = '</Marker>';

      warningList.push(<li key='guessed_tracking'>
        <p>
          The optimizer had to guess which of your markers were placed on bony landmarks, and which were not. This is probably because in the unscaled OpenSim model you uploaded, all or most of your markers were listed as <code>&lt;fixed&gt;<b>false</b>&lt;/fixed&gt;</code>, or they were all <code>&lt;fixed&gt;<b>true</b>&lt;/fixed&gt;</code>.
          You may achieve higher quality results if you specify all the markers placed on <b><i>bony landmarks (i.e. "anatomical markers")</i></b> as <code>&lt;fixed&gt;<b>true</b>&lt;/fixed&gt;</code>, and all the markers placed on <b><i>soft tissue (i.e. "tracking markers")</i></b> as <code>&lt;fixed&gt;<b>false</b>&lt;/fixed&gt;</code>.
        </p>
        <p>Here's an example marker that's been correctly specified as <code>&lt;fixed&gt;<b>true</b>&lt;/fixed&gt;</code>:
        </p>
        <p>
          <code>
            <pre style={{ marginBottom: 0 }}>
              {markerText}
            </pre>
            <b><pre style={{ marginBottom: 0 }}>
              {markerText2}
            </pre></b>
            <pre>
              {markerText3}
            </pre>
          </code>
        </p>
      </li>);
    }

    if (trialMarkerSets != null) {
      let trials = Object.keys(trialMarkerSets);

      let trialOnly: string[] = [];
      let shared: string[] = [];

      for (let key of trials) {
        let trialMarkerSet: string[] = trialMarkerSets[key];

        for (let tm of trialMarkerSet) {
          if (osimMarkers.indexOf(tm) === -1) {
            if (trialOnly.indexOf(tm) === -1) {
              trialOnly.push(tm);
            }
          }
          else {
            if (shared.indexOf(tm) === -1) {
              shared.push(tm);
            }
          }
        }
      }

      if (trialOnly.length > 0) {
        warningList.push(<li key={'unused-markers'}>
          <p>There were <b><i>{trialOnly.length} markers</i></b> in the mocap file(s) that were ignored by the optimizer, because they weren't in the unscaled OpenSim model you uploaded: <b><i>{trialOnly.join(', ')}</i></b>. These appear as "Unused Markers" in the visualizer - you can mouse over them to see which one is which.</p>
        </li>);
      }
    }

    let guessedMarkersWarning = null;
    if (warningList.length > 0) {
      guessedMarkersWarning = <div className="alert alert-warning">
        <h4><i className="mdi mdi-alert me-2 vertical-middle"></i> Warning: Results may be suboptimal!</h4>
        <p>
          The optimizer detected some issues in the uploaded files. We can't detect everything automatically, so see our <a href="https://addbiomechanics.org/instructions.html" target="_blank">Tips and Tricks page</a> for more suggestions.
        </p>
        <hr />
        <ul>
          {warningList}
        </ul>
        <hr />
        <p>
          You can ignore these warnings if you are happy with your results, or you can re-upload an updated model by drag-and-drop on top of the "Unscaled OpenSim" file, and then hit "Reprocess" (below in yellow) to fix the problem.
        </p>
      </div>;
    }

    statusBadge = <span className="badge bg-primary">Processed</span>;
    statusDetails = <>
      <h4>Results: {(autoAvgRMSE * 100 ?? 0.0).toFixed(2)} cm RMSE</h4>
      {guessedMarkersWarning}
      {download}
      <div style={{ 'marginBottom': '5px' }}>
        <Button variant="success" onClick={() => { setShowViewerHint(true) }}>
          <i className="mdi mdi-eye me-2 vertical-middle"></i>
          View Results in 3D Visualizer
        </Button>
      </div>
      <Button variant="warning" onClick={props.cursor.requestReprocessSubject}>
        <i className="mdi mdi-refresh me-2 vertical-middle"></i>
        Reprocess
      </Button>
      <Link
        style={{
          marginLeft: '7px'
        }}
        to={{
          search: "?logs=true"
        }}
        replace
      >View Processing Logs</Link>
    </>;
  }
  else if (status === "error") {
    statusBadge = <span className="badge bg-danger">Error</span>;
    statusDetails = <>
      <Button variant="warning" onClick={props.cursor.requestReprocessSubject}>
        <i className="mdi mdi-refresh me-2 vertical-middle"></i>
        Reprocess
      </Button>
      <Link
        style={{
          marginLeft: '7px'
        }}
        to={{
          search: "?logs=true"
        }}
        replace
      >View Processing Logs</Link>
    </>;
  }
  else if (status === "processing") {
    statusBadge = <span className="badge bg-warning">Processing</span>;
    statusDetails =
      <>
        <div>
          <Link
            style={{
              marginLeft: '7px'
            }}
            to={{
              search: "?logs=true"
            }}
            replace
          >Watch Live Processing Logs</Link>
        </div>
        <div>
          We'll send you an email when your data has finished processing!
        </div>
      </>;
  }
  else if (status === "could-process") {
    if (props.cursor.canEdit()) {
      statusDetails = <Button onClick={props.cursor.markReadyForProcessing}>Process And Share</Button>;
    }
    else {
      statusBadge = <span className="badge bg-secondary">Waiting for owner to process</span>;
    }
  }
  else if (status === "waiting") {
    statusBadge = <span className="badge bg-secondary">Waiting for server {props.cursor.getQueueOrder()}</span>;
    statusDetails = <div>
      We'll send you an email when your data has finished processing!
    </div>
  }
  else if (status === 'empty') {
    statusBadge = <span className="badge bg-danger">Missing required data</span>;
    statusDetails = <div>
      Missing data is highlighted below in red. Please input the data (or if it's a trial that's missing data, you can also delete the trial).
    </div>
  }

  let advancedOptions = null;
  if (false) {
    advancedOptions = <>
      <hr />
      <button className="btn" type="button" onClick={() => setShowAdvanced(!showAdvanced)}>
        <i className={"mdi mdi-arrow-" + (showAdvanced ? "down" : "right") + "-drop-circle-outline me-1 text-muted vertical-middle"}></i>
        {showAdvanced ? "Hide" : "Show"} Advanced Options
      </button>
      <div className={"collapse" + (showAdvanced ? " show" : "")}>
        <h4>
          <i className="mdi mdi-alert me-1 text-muted vertical-middle"></i>
          Advanced Options
        </h4>
        <div className="card card-body">
          Anim pariatur cliche reprehenderit, enim eiusmod high life accusamus terry richardson ad squid. Nihil anim keffiyeh helvetica, craft beer labore wes anderson cred nesciunt sapiente ea proident.
        </div>
      </div>
    </>;
  }

  let header = null;
  if (props.cursor.subjectJson.isLoadingFirstTime()) {
    header = <>
      <div className="mb-15">
        <h5>Status <span className="badge bg-secondary">Loading</span></h5>
      </div>
      <div className="row g-3">
        <div className="col-md-4">
          <Spinner animation='border' />
        </div>
      </div>
    </>;
  }
  else {
    header = <>
      <div className="mb-15">
        <h5>Status {statusBadge}</h5>
        <div className="mb-15">{statusDetails}</div>
      </div>
      <form className="row g-3">
        <div className="col-md-4">
          <label htmlFor="heightM" className="form-label">
            Height without shoes (m):
            <OverlayTrigger
              placement="right"
              delay={{ show: 50, hide: 400 }}
              overlay={(props) => (
                <Tooltip id="button-tooltip" {...props}>
                  We use this (in addition to weight and biological sex) to condition the statistical prior for bone dimensions. Approximate values are ok.
                </Tooltip>
              )}
            >
              <i className="mdi mdi-help-circle-outline text-muted vertical-middle" style={{ marginLeft: '5px' }}></i>
            </OverlayTrigger>
          </label>
          <input type="number" className={"form-control" + ((heightValue < 0.1 || heightValue > 3.0) ? " is-invalid" : "")} id="heightM" value={heightValue} onChange={(e) => {
            props.cursor.subjectJson.setAttribute("heightM", e.target.value);
          }} onFocus={(e) => {
            props.cursor.subjectJson.onFocusAttribute("heightM");
          }} onBlur={(e) => {
            props.cursor.subjectJson.onBlurAttribute("heightM");
          }} />
          {(() => {
            if (heightValue < 0.1) {
              return (
                <div className="invalid-feedback">
                  Humans are generally not less than 0.1 meters tall.
                </div>
              );
            }
            else if (heightValue > 3.0) {
              return (
                <div className="invalid-feedback">
                  Humans are generally not more than 3 meters tall.
                </div>
              );
            }
          })()}
        </div>
        <div className="col-md-4">
          <label htmlFor="weightKg" className="form-label">
            Weight (kg):
            <OverlayTrigger
              placement="right"
              delay={{ show: 50, hide: 400 }}
              overlay={(props) => (
                <Tooltip id="button-tooltip" {...props}>
                  We use this (in addition to height and biological sex) to condition the statistical prior for bone dimensions. Approximate values are ok.
                </Tooltip>
              )}
            >
              <i className="mdi mdi-help-circle-outline text-muted vertical-middle" style={{ marginLeft: '5px' }}></i>
            </OverlayTrigger>
          </label>
          <input type="number" className={"form-control" + ((weightValue < 5 || weightValue > 700) ? " is-invalid" : "")} id="weightKg" value={weightValue} onChange={(e) => {
            props.cursor.subjectJson.setAttribute("massKg", e.target.value);
          }} onFocus={(e) => {
            props.cursor.subjectJson.onFocusAttribute("massKg");
          }} onBlur={(e) => {
            props.cursor.subjectJson.onBlurAttribute("massKg");
          }} />
          {(() => {
            if (weightValue < 5) {
              return (
                <div className="invalid-feedback">
                  Humans are generally not less than 5 kilograms.
                </div>
              );
            }
            else if (weightValue > 700) {
              return (
                <div className="invalid-feedback">
                  Humans are generally not more than 700 kilograms.
                </div>
              );
            }
          })()}
        </div>
        <div className="col-md-4">
          <label htmlFor="weightKg" className="form-label">
            Biological Sex:
            <OverlayTrigger
              placement="right"
              delay={{ show: 50, hide: 400 }}
              overlay={(props) => (
                <Tooltip id="button-tooltip" {...props}>
                  We use this (in addition to height and weight) to condition the statistical prior for bone dimensions, if subject sex is available.
                </Tooltip>
              )}
            >
              <i className="mdi mdi-help-circle-outline text-muted vertical-middle" style={{ marginLeft: '5px' }}></i>
            </OverlayTrigger>
          </label>
          <select className="form-control" id="sex" value={sexValue} onChange={(e) => {
            props.cursor.subjectJson.setAttribute("sex", e.target.value);
          }} onFocus={(e) => {
            props.cursor.subjectJson.onFocusAttribute("sex");
          }} onBlur={(e) => {
            props.cursor.subjectJson.onBlurAttribute("sex");
          }}>
            <option value="unknown">Unknown</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        </div>
      </form>
    </>
  }

  return (
    <div className="MocapView">
      <MocapTrialModal cursor={props.cursor} />
      <MocapLogModal cursor={props.cursor} />
      <h3>
        <i className="mdi mdi-walk me-1 text-muted vertical-middle"></i>
        Subject: {props.cursor.getCurrentFileName()}{" "}
        {/*<span className="badge bg-secondary">{"TODO"}</span>*/}
      </h3>
      {header}
      <div className="mb-15">
        <h5>Unscaled OpenSim</h5>
        <DropFile cursor={props.cursor} path={"unscaled_generic.osim"} accept=".osim" validateFile={validateOpenSimFile} required />
      </div>
      <div className="mb-15">Compare optimized skeleton with hand-scaled version: <input type="checkbox" checked={showValidationControls} onChange={(e) => {
        props.cursor.setShowValidationControls(e.target.checked);
      }} />
      </div>
      {manuallyScaledOpensimUpload}
      <div>
        <Table
          responsive={trials.length > 2}
          className="table table-centered table-nowrap mb-0 mt-2"
          style={{
            tableLayout: 'fixed',
            width: '100%'
          }}
        >
          <colgroup>
            <col style={{ width: "20%" }} />
            <col style={{ width: ((100 - 20 - (props.cursor.canEdit() ? 15 : 0)) / (showValidationControls ? 3 : 2)) + "%" }} />
            <col style={{ width: ((100 - 20 - (props.cursor.canEdit() ? 15 : 0)) / (showValidationControls ? 3 : 2)) + "%" }} />
            {showValidationControls ? <col style={{ width: ((100 - 20 - (props.cursor.canEdit() ? 15 : 0)) / 3) + "%" }} /> : null}
            {props.cursor.canEdit() ? (
              <col style={{ width: "15%" }} />
            ) : null}
          </colgroup>
          <thead className="table-light">
            <tr>
              <th className="border-0" >Trial Name</th>
              <th className="border-0" colSpan={2}>Mocap File</th>
              {manualIkRowHeader}
              {props.cursor.canEdit() ? (
                <th className="border-0">
                  Action
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>{trialViews}</tbody>
        </Table>
        <Button onClick={() => navigate({ search: "?new-trial" })}>Create new trial</Button>
        {advancedOptions}
      </div>
    </div>
  );
});

export default MocapSubjectView;
