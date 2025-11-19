import chalk from 'chalk';

export class Logger {
  /**
   * Log info message
   */
  static info(message: string): void {
    console.log(chalk.blue('ℹ'), message);
  }

  /**
   * Log success message
   */
  static success(message: string): void {
    console.log(chalk.green('✓'), message);
  }

  /**
   * Log warning message
   */
  static warn(message: string): void {
    console.log(chalk.yellow('⚠'), message);
  }

  /**
   * Log error message
   */
  static error(message: string): void {
    console.log(chalk.red('✗'), message);
  }

  /**
   * Log step message (with emoji)
   */
  static step(emoji: string, message: string): void {
    console.log(emoji, chalk.bold(message));
  }

  /**
   * Log header/title
   */
  static header(message: string): void {
    console.log();
    console.log(chalk.bold.cyan('='.repeat(50)));
    console.log(chalk.bold.cyan(message));
    console.log(chalk.bold.cyan('='.repeat(50)));
    console.log();
  }

  /**
   * Log section
   */
  static section(message: string): void {
    console.log();
    console.log(chalk.bold(message));
    console.log(chalk.gray('-'.repeat(message.length)));
  }

  /**
   * Log plain message
   */
  static log(message: string): void {
    console.log(message);
  }

  /**
   * Log empty line
   */
  static br(): void {
    console.log();
  }

  /**
   * Log key-value pair
   */
  static kv(key: string, value: string): void {
    console.log(`  ${chalk.gray(key + ':')} ${value}`);
  }

  /**
   * Log command to run
   */
  static command(cmd: string): void {
    console.log(chalk.gray('  $ ') + chalk.cyan(cmd));
  }
}
