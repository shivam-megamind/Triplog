import Image from "next/image";
import Link from "next/link";
import styles from "./landing.module.css";

const bookHref = "/book";

export default function Home() {
  return (
    <main className={styles.landing}>
      <section className={styles.hero} aria-labelledby="hero-title">
        <Image
          className={styles.heroImage}
          src="/images/lunch.jpg"
          alt="A long lunch shared around a warmly lit table"
          fill
          priority
          sizes="100vw"
        />
        <div className={styles.heroShade} />
        <header className={styles.heroHeader}>
          <p className={styles.wordmark}>Triplog</p>
          <p className={styles.headerNote}>Built from your photos. Told in your voice.</p>
        </header>

        <div className={styles.heroCopy}>
          <p className={styles.kicker}>Your private travel book</p>
          <h1 id="hero-title">Your trip happened. Don&apos;t let it disappear into your camera roll.</h1>
          <p className={styles.heroSupporting}>
            Drop in the photos from one trip. Triplog reconstructs the days, places, and moments—then gives you a beautiful travel book to make your own.
          </p>
          <p className={styles.trust}>Private by default. You choose what to keep, edit, and share.</p>
          <Link className={styles.cta} href={bookHref}>Turn a trip into a book</Link>
        </div>

        <div className={styles.heroBook} aria-label="Example Triplog travel book page">
          <div className={styles.heroBookPhoto}>
            <Image
              src="/images/coast.jpg"
              alt="Sunlit sea beside a quiet beach"
              fill
              sizes="(max-width: 700px) 76vw, 34vw"
            />
          </div>
          <div className={styles.heroBookWords}>
            <p>Day 03 · Ubud</p>
            <p>The place with the yellow umbrellas.</p>
          </div>
        </div>

        <p className={styles.photoCredit}>Photography via Unsplash</p>
      </section>

      <section className={`${styles.storySection} ${styles.reconstruction}`} aria-labelledby="reconstruction-title">
        <div className={styles.sectionCopy}>
          <p className={styles.sectionNumber}>01 · Reconstruct</p>
          <h2 id="reconstruction-title">From scattered photos to the story you actually lived.</h2>
          <p>Your camera roll already holds the clues. Triplog groups your memories into a journey by day and place, ready for you to revisit.</p>
        </div>

        <div className={styles.reconstructionVisual} aria-label="Photos becoming a day-by-day journey and finished book">
          <div className={styles.loosePhotos}>
            <p className={styles.visualLabel}>Your camera roll</p>
            <figure className={`${styles.loosePhoto} ${styles.loosePhotoOne}`}>
              <Image src="/images/rice-terraces.jpg" alt="Temple beside a lake in Bali" fill sizes="180px" />
            </figure>
            <figure className={`${styles.loosePhoto} ${styles.loosePhotoTwo}`}>
              <Image src="/images/lunch.jpg" alt="A memorable meal shared at a restaurant" fill sizes="180px" />
            </figure>
            <figure className={`${styles.loosePhoto} ${styles.loosePhotoThree}`}>
              <Image src="/images/road.jpg" alt="A road winding between red mountains" fill sizes="180px" />
            </figure>
          </div>

          <div className={styles.storyPath} aria-hidden="true"><span>→</span></div>

          <div className={styles.timelinePreview}>
            <p className={styles.visualLabel}>Triplog&apos;s first draft</p>
            <div className={styles.timelineDay}>
              <span>01</span>
              <div><strong>Arrival</strong><small>2 places · 18 photos</small></div>
            </div>
            <div className={`${styles.timelineDay} ${styles.activeDay}`}>
              <span>03</span>
              <div><strong>Ubud</strong><small>Map pin · 34 photos</small></div>
            </div>
            <div className={styles.timelineDay}>
              <span>04</span>
              <div><strong>Ready to review</strong><small>Add what only you know</small></div>
            </div>
          </div>

          <div className={styles.storyPath} aria-hidden="true"><span>→</span></div>

          <div className={styles.miniBook}>
            <p className={styles.visualLabel}>Your travel book</p>
            <div className={styles.miniBookSpread}>
              <div className={styles.miniBookImage}>
                <Image src="/images/rice-terraces.jpg" alt="Bali temple presented in a finished Triplog page" fill sizes="220px" />
              </div>
              <div className={styles.miniBookCopy}>
                <small>Day 03</small>
                <strong>Ubud</strong>
                <span>A place, a day, and the detail worth keeping.</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className={`${styles.storySection} ${styles.journal}`} aria-labelledby="journal-title">
        <div className={styles.sectionCopy}>
          <p className={styles.sectionNumber}>02 · Remember</p>
          <h2 id="journal-title">The details you thought you&apos;d forget, kept close.</h2>
          <p>Add the small things only you would remember: the meal you would order again, the hotel worth skipping, the road that changed the plan.</p>
        </div>

        <div className={styles.journalStage}>
          <div className={styles.journalSpread}>
            <div className={styles.journalPhoto}>
              <Image src="/images/road.jpg" alt="A road through red mountains in a travel journal" fill sizes="(max-width: 700px) 88vw, 48vw" />
              <p>Day 04 · On the road</p>
            </div>
            <div className={styles.journalNote}>
              <p className={styles.noteLabel}>A note in your own words</p>
              <blockquote>“The road changed the plan. We stopped here instead.”</blockquote>
              <div className={styles.noteRule} />
              <p className={styles.notePrompt}>Keep the detail the photograph cannot show.</p>
              <p className={styles.noteMeta}>12 May · Saved privately</p>
            </div>
          </div>
        </div>
      </section>

      <section className={`${styles.storySection} ${styles.sharing}`} aria-labelledby="sharing-title">
        <div className={styles.sectionCopy}>
          <p className={styles.sectionNumber}>03 · Pass it on</p>
          <h2 id="sharing-title">When a friend asks for your recommendations, send them your trip.</h2>
          <p>Share the parts you want. Give someone more than a list of places—give them the route, the context, and the honest advice behind it.</p>
        </div>

        <div className={styles.sharedGuide} aria-label="Read-only shared Triplog preview">
          <div className={styles.guideBar}>
            <p>Triplog</p>
            <span>Shared read-only</span>
          </div>
          <div className={styles.guideHero}>
            <Image src="/images/coast.jpg" alt="A coast shown inside a shared travel guide" fill sizes="(max-width: 700px) 92vw, 60vw" />
            <div><small>A completed trip</small><strong>Notes from the coast</strong></div>
          </div>
          <div className={styles.guideRecommendations}>
            <p><span>Go early</span>The quiet hour before the beach fills.</p>
            <p><span>Keep close</span>The route, place, and context behind each stop.</p>
            <p><span>From the trip</span>Only the details the traveller chose to share.</p>
          </div>
        </div>

        <div className={styles.finalAction}>
          <p>Your photos are already waiting.</p>
          <Link className={`${styles.cta} ${styles.darkCta}`} href={bookHref}>Turn a trip into a book</Link>
        </div>
      </section>
    </main>
  );
}
