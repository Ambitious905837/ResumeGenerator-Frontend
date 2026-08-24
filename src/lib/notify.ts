import { toast } from 'sonner';

/**
 * Outcome messages, in one place.
 *
 * Every call site used to build its own `{type, text}` object and render it into a
 * banner; routing them through here means the wording of a partial result ("3 of 5")
 * is decided once, and a page never has to hold message state at all.
 */
export const notify = {
  success(message: string, description?: string) {
    toast.success(message, { description });
  },
  error(message: string, description?: string) {
    // Errors stay up longer: they usually name a Drive folder or a Google error the
    // user needs time to read, and unlike a success there is nothing else on screen
    // confirming what happened.
    toast.error(message, { description, duration: 8000 });
  },
  info(message: string, description?: string) {
    toast.info(message, { description });
  },
  warning(message: string, description?: string) {
    toast.warning(message, { description, duration: 7000 });
  },

  /**
   * The result of a batch: all good, some good, or none.
   *
   * Batch generation is the app's main action and it partially fails often enough that
   * "success" and "failure" alone misreport it.
   */
  batch(succeeded: number, total: number, noun: string, description?: string) {
    const message = `${succeeded} of ${total} ${noun} ${succeeded === 1 ? 'was' : 'were'} generated.`;
    if (total === 0) return;
    if (succeeded === total) notify.success(`Done — ${message}`, description);
    else if (succeeded > 0) notify.warning(`Partly done — ${message}`, description);
    else notify.error(`Nothing generated — 0 of ${total} ${noun} succeeded.`, description);
  },
};
