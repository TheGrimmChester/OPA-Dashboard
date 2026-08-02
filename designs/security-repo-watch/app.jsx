/* Design canvas — Watch + PR Jobs × three variants */

function App() {
  return (
    <>
      <DesignCanvas>
        <DCSection
          id="repo-watch"
          title="Security · Repo Watch"
          subtitle="A faithful · B workspace · C gate map — click PR Jobs in the rail inside any artboard"
        >
          <DCArtboard id="a-watch" label="A · Watch · Faithful" width={1320} height={900}>
            <VariantA initialTab="watch" />
          </DCArtboard>
          <DCArtboard id="b-watch" label="B · Watch · Workspace" width={1320} height={900}>
            <VariantB initialTab="watch" />
          </DCArtboard>
          <DCArtboard id="c-watch" label="C · Watch · Gate map" width={1320} height={900}>
            <VariantC initialTab="watch" />
          </DCArtboard>
        </DCSection>

        <DCSection
          id="pr-jobs"
          title="Security · PR Jobs"
          subtitle="Same three directions — queue polish · master–detail evidence · swimlane story board"
        >
          <DCArtboard id="a-jobs" label="A · Jobs · Faithful" width={1320} height={900}>
            <VariantA initialTab="jobs" />
          </DCArtboard>
          <DCArtboard id="b-jobs" label="B · Jobs · Workspace" width={1320} height={900}>
            <VariantB initialTab="jobs" />
          </DCArtboard>
          <DCArtboard id="c-jobs" label="C · Jobs · Swimlanes" width={1320} height={900}>
            <VariantC initialTab="jobs" />
          </DCArtboard>
        </DCSection>

        <DCPostIt id="note-1" x={40} y={40}>
          Six artboards: Watch + PR Jobs for A/B/C. Expand fullscreen and use the left rail to switch tabs inside a variant.
        </DCPostIt>
      </DesignCanvas>
      <div className="explore-note">
        Canvas: Watch row + Jobs row · preview.html for a single interactive shell · rail switches Watch ↔ PR Jobs
      </div>
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
