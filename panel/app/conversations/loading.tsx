import styles from "./conversations.module.css";

export default function LoadingConversationsPage() {
  return (
    <main className={styles.pageMain}>
      <section className={styles.shell}>
        <aside className={styles.sidebar}>
          <div className={styles.sidebarHeaderSkeleton} />
          <div className={styles.searchSkeleton} />
          <div className={styles.list}>
            {Array.from({ length: 8 }).map((_, index) => (
              <div className={styles.itemSkeleton} key={index} />
            ))}
          </div>
        </aside>
        <section className={styles.threadPane}>
          <div className={styles.threadHeaderSkeleton} />
          <div className={styles.messagesArea}>
            <div className={styles.bubbleSkeleton} />
            <div className={`${styles.bubbleSkeleton} ${styles.bubbleSkeletonOut}`} />
            <div className={styles.bubbleSkeleton} />
          </div>
          <div className={styles.footerSkeleton} />
        </section>
      </section>
    </main>
  );
}
