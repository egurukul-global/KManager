const fs = require('fs');
let code = fs.readFileSync('src/pages/income.js', 'utf8');

// The first </form> is the record income form.
// We just need to replace the first occurrence of </form>
code = code.replace('</form>', `
        <div class="btn-group" style="margin-top: 20px;">
          <button type="submit" class="success">Save Income</button>
        </div>
      </form>`);

fs.writeFileSync('src/pages/income.js', code, 'utf8');
console.log('Added submit button back');
