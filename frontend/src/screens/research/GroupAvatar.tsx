import { MemberAvatar } from "../team/MemberEditor";
import type { TeamMember } from "./team-api";
import styles from "./GroupAvatar.module.css";

/** A group chat's picture, as chat apps make one: its members' faces, up to four, in a square. */
export function GroupAvatar({
  members,
  size,
}: {
  members: TeamMember[];
  size?: "sm";
}) {
  const faces = members
    .filter((m) => m.role !== "human" && !m.deleted)
    .slice(0, 4);
  return (
    <span
      className={styles.group}
      data-count={faces.length}
      data-size={size}
      aria-hidden="true"
    >
      {faces.map((member) => (
        <span key={member.id} className={styles.cell}>
          <MemberAvatar member={member} />
        </span>
      ))}
    </span>
  );
}
